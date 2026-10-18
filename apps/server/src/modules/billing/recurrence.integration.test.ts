/**
 * Інтеграційні тести на реальному Postgres: скасування й checkout підписок
 * (аудит 2026-10-01, data-20 і data-21).
 *
 * Юніт-тести білінгу мокають `pool.query`, тож текст SQL перевіряють, а
 * НАСЛІДОК - ні. Тут наслідок і є предметом: що лежить у `subscriptions` і
 * `plata_subscription` після послідовності подій. Покрито:
 *   - data-20: новий `provider_subscription_id` скидає `cancel_at_period_end`
 *     (Plata / LiqPay / Stripe), той самий - зберігає; відмова monobank не
 *     ставить прапорець;
 *   - data-21: мапінг Plata 1:N, вебхук по будь-якому id резолвиться,
 *     активація другої підписки скасовує першу (між провайдерами теж),
 *     відмова скасування НЕ відкочує активацію (черга + ретрай), запізнілий
 *     вебхук/термінальна подія замінених не воскрешає й не гасить нову;
 *     409 ALREADY_SUBSCRIBED / CHECKOUT_PENDING;
 *   - міграція 154: форма PK, backfill, down -> up.
 *
 * Мережа (monobank, LiqPay, Stripe) замінена `fetch`-стабом: тест перевіряє
 * наші запити, не їхні сервери.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express from "express";
import request from "supertest";

const { mockEnv, getSessionUserMock } = vi.hoisted(() => ({
  mockEnv: {} as Record<string, unknown>,
  getSessionUserMock: vi.fn(),
}));
vi.mock("../../env/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../env/env.js")>();
  Object.assign(mockEnv, actual.env);
  return {
    ...actual,
    get env() {
      return mockEnv;
    },
  };
});
vi.mock("../../auth.js", () => ({ getSessionUser: getSessionUserMock }));
vi.mock("../me/dataRights.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../me/dataRights.js")>()),
  getAccountDeletionStatus: vi.fn(async () => ({ pending: false })),
}));
vi.mock("../../http/rateLimit.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../http/rateLimit.js")
  >("../../http/rateLimit.js");
  return {
    ...actual,
    rateLimitExpress: () => (_req: unknown, _res: unknown, next: () => void) =>
      next(),
  };
});

import {
  bootIntegrationHarness,
  shutdownIntegrationHarness,
  seedIntegrationUser,
  truncateIntegrationTables,
  INTEGRATION_TIMEOUT_MS,
  type IntegrationHarness,
} from "../../test/createIntegrationApp.js";
import { errorHandler } from "../../http/errorHandler.js";
import { createBillingRouter } from "../../routes/billing.js";
import { plataProvider } from "./plata.js";
import { reconcileBySubscriptionId, runSlowTick } from "./plataSync.js";
import { retryPendingCancellations } from "./supersede.js";
import { liqpayProvider, encodeData, encodeOrderId } from "./liqpay.js";
import { assertCheckoutAllowed } from "./checkoutGuard.js";
import { processStripeWebhook } from "./stripeWebhook.js";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);
const USER = "u_recur_01";

let harness: IntegrationHarness;
let dockerAvailable = false;

beforeAll(async () => {
  try {
    harness = await bootIntegrationHarness({ app: false });
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    console.warn(
      "[billing recurrence integration] Skipping:",
      e instanceof Error ? e.message : String(e),
    );
  }
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

beforeEach(async () => {
  mockEnv["PLATA_TOKEN"] = "merchant-token";
  mockEnv["PLATA_ENABLED"] = true;
  mockEnv["PLATA_MODE"] = "test";
  mockEnv["LIQPAY_ENABLED"] = true;
  mockEnv["LIQPAY_PUBLIC_KEY"] = "sandbox_i123";
  mockEnv["LIQPAY_PRIVATE_KEY"] = "sandbox_priv";
  mockEnv["STRIPE_SECRET_KEY"] = "sk_test_x";
  mockEnv["PRO_MONTHLY_UAH_KOPIYKAS"] = 19900;
  getSessionUserMock.mockReset();
  getSessionUserMock.mockResolvedValue({ id: USER, email: "u@test.local" });
  if (!dockerAvailable) return;
  await truncateIntegrationTables(harness.pool);
  await seedIntegrationUser(harness.pool, USER);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── helpers ──────────────────────────────────────────────────────────────

interface FetchPlan {
  /** Статус monobank `subscription/status` за id; за замовчуванням `active`. */
  plataStatus?: Record<string, string>;
  /** HTTP-статус `subscription/edit`. */
  plataEditStatus?: number;
  /** HTTP-статус `subscription/remove` (default 200). */
  plataRemoveStatus?: number;
  /** Тіло відповіді LiqPay `/api/request`. */
  liqpayBody?: unknown;
  /** HTTP-статус Stripe cancel. */
  stripeStatus?: number;
}

function stubFetch(plan: FetchPlan = {}) {
  let nextSub = 0;
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/subscription/create")) {
      nextSub += 1;
      return Response.json({
        subscriptionId: `sub_new_${nextSub}`,
        pageUrl: `https://pay.example/${nextSub}`,
      });
    }
    if (url.includes("/subscription/status")) {
      const id = new URL(url).searchParams.get("subscriptionId") ?? "";
      return Response.json({
        subscriptionId: id,
        status: plan.plataStatus?.[id] ?? "active",
        nextChargeDate: "2099-01-01T00:00:00.000Z",
      });
    }
    if (url.includes("/subscription/edit")) {
      return new Response("", { status: plan.plataEditStatus ?? 200 });
    }
    if (url.includes("/subscription/remove")) {
      return new Response("", { status: plan.plataRemoveStatus ?? 200 });
    }
    if (url.includes("liqpay.ua/api/request")) {
      return Response.json(plan.liqpayBody ?? { result: "ok" });
    }
    if (url.includes("api.stripe.com")) {
      return new Response("{}", { status: plan.stripeStatus ?? 200 });
    }
    throw new Error(`unexpected fetch: ${url} ${init?.method ?? "GET"}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const urlsOf = (m: ReturnType<typeof stubFetch>) =>
  m.mock.calls.map((c) => String(c[0]));
const editedIds = (m: ReturnType<typeof stubFetch>) =>
  m.mock.calls
    .filter((c) => String(c[0]).includes("/subscription/edit"))
    .map(
      (c) =>
        (
          JSON.parse(String((c[1] as RequestInit).body)) as {
            subscriptionId: string;
          }
        ).subscriptionId,
    );

async function seedLive(opts: {
  provider: "plata" | "liqpay" | "stripe" | "manual";
  subscriptionId?: string | null;
  cancelAtPeriodEnd?: boolean;
  status?: string;
  periodEnd?: string | null;
}) {
  await harness.pool.query(
    `INSERT INTO subscriptions
       (user_id, plan, status, provider, provider_subscription_id,
        current_period_end, cancel_at_period_end)
     VALUES ($1, 'pro', $2, $3, $4, $5, $6)`,
    [
      USER,
      opts.status ?? "active",
      opts.provider,
      opts.subscriptionId ?? null,
      opts.periodEnd === undefined ? "2099-01-01T00:00:00Z" : opts.periodEnd,
      opts.cancelAtPeriodEnd ?? false,
    ],
  );
}

async function seedPlataMapping(
  subscriptionId: string,
  opts: { confirmed?: boolean; ageMinutes?: number } = {},
) {
  await harness.pool.query(
    `INSERT INTO plata_subscription (user_id, subscription_id, confirmed_at, created_at)
     VALUES ($1, $2, $3, NOW() - make_interval(mins => $4))`,
    [
      USER,
      subscriptionId,
      opts.confirmed ? new Date() : null,
      opts.ageMinutes ?? 1,
    ],
  );
}

async function liveRow() {
  const { rows } = await harness.pool.query<{
    provider: string;
    provider_subscription_id: string | null;
    cancel_at_period_end: boolean;
    status: string;
  }>(
    `SELECT provider, provider_subscription_id, cancel_at_period_end, status
       FROM subscriptions
      WHERE user_id = $1 AND status IN ('active','trialing','past_due')`,
    [USER],
  );
  return rows;
}

async function plataRow(id: string) {
  const { rows } = await harness.pool.query<{
    confirmed_at: Date | null;
    superseded_at: Date | null;
  }>(
    `SELECT confirmed_at, superseded_at FROM plata_subscription WHERE subscription_id = $1`,
    [id],
  );
  return rows[0];
}

async function pendingRow(provider: string, id: string) {
  const { rows } = await harness.pool.query<{
    attempts: number;
    resolved_at: Date | null;
  }>(
    `SELECT attempts, resolved_at FROM billing_pending_cancellation
      WHERE provider = $1 AND provider_subscription_id = $2`,
    [provider, id],
  );
  const row = rows[0];
  return row
    ? { attempts: row.attempts, resolved: row.resolved_at !== null }
    : null;
}

function liqpayCallback(orderId: string, status = "success") {
  return encodeData({
    order_id: orderId,
    status,
    action: "regular",
    payment_id: `pay_${Math.random().toString(16).slice(2)}`,
  });
}

// ── data-20 ──────────────────────────────────────────────────────────────

describe("data-20: cancel_at_period_end не успадковується новою підпискою", () => {
  it("Plata: повторна підписка (новий id) скидає прапорець, а не повертає already_canceling", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const fetchMock = stubFetch();
    // Скасована раніше підписка, період давно минув, рядок лишився 'active'.
    await seedLive({
      provider: "plata",
      subscriptionId: "sub_old",
      cancelAtPeriodEnd: true,
      periodEnd: "2020-01-01T00:00:00Z",
    });
    await seedPlataMapping("sub_old", { confirmed: true, ageMinutes: 9999 });
    await seedPlataMapping("sub_fresh");

    await reconcileBySubscriptionId(harness.pool, "sub_fresh");

    const [row] = await liveRow();
    expect(row?.provider_subscription_id).toBe("sub_fresh");
    expect(row?.cancel_at_period_end).toBe(false);
    // Стара підписка вже була скасована в monobank: вдруге її не смикаємо.
    expect(editedIds(fetchMock)).toEqual([]);

    // Тепер «Скасувати» реально доходить до monobank.
    await expect(
      plataProvider.cancelSubscription(harness.pool, USER),
    ).resolves.toBe("canceled");
    expect(editedIds(fetchMock)).toEqual(["sub_fresh"]);
    expect((await liveRow())[0]?.cancel_at_period_end).toBe(true);
  });

  it("Plata: поновлення тієї самої підписки зберігає прапорець", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    stubFetch();
    await seedLive({
      provider: "plata",
      subscriptionId: "sub_same",
      cancelAtPeriodEnd: true,
    });
    await seedPlataMapping("sub_same", { confirmed: true });

    await reconcileBySubscriptionId(harness.pool, "sub_same");

    expect((await liveRow())[0]?.cancel_at_period_end).toBe(true);
  });

  it("LiqPay: success-колбек з новим order_id скидає прапорець, той самий order_id - ні", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    stubFetch();
    const oldOrder = encodeOrderId(USER);
    await seedLive({
      provider: "liqpay",
      subscriptionId: oldOrder,
      cancelAtPeriodEnd: true,
    });

    // Наступне списання тієї ж підписки: прапорець лишається.
    await liqpayProvider.processWebhook(harness.pool, liqpayCallback(oldOrder));
    expect((await liveRow())[0]?.cancel_at_period_end).toBe(true);

    // Нова підписка (інший order_id): прапорець старої не успадковується.
    const newOrder = encodeOrderId(USER);
    await liqpayProvider.processWebhook(harness.pool, liqpayCallback(newOrder));
    const [row] = await liveRow();
    expect(row?.provider_subscription_id).toBe(newOrder);
    expect(row?.cancel_at_period_end).toBe(false);
  });

  it("Stripe: checkout.session.completed з новою підпискою скидає прапорець", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    stubFetch();
    await seedLive({
      provider: "stripe",
      subscriptionId: "sub_stripe_old",
      cancelAtPeriodEnd: true,
    });
    const event = {
      id: "evt_data20_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_data20",
          client_reference_id: USER,
          customer: "cus_1",
          subscription: "sub_stripe_new",
          metadata: { plan: "pro" },
        },
      },
    };
    await processStripeWebhook(
      harness.pool,
      event,
      Buffer.from(JSON.stringify(event)),
    );
    const [row] = await liveRow();
    expect(row?.provider_subscription_id).toBe("sub_stripe_new");
    expect(row?.cancel_at_period_end).toBe(false);
  });

  it("Plata: відмова monobank (500) не ставить прапорець, повтор проходить", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await seedLive({ provider: "plata", subscriptionId: "sub_retry" });

    stubFetch({ plataEditStatus: 500 });
    await expect(
      plataProvider.cancelSubscription(harness.pool, USER),
    ).rejects.toThrow(/HTTP 500/);
    expect((await liveRow())[0]?.cancel_at_period_end).toBe(false);

    const fetchMock = stubFetch({ plataEditStatus: 200 });
    await expect(
      plataProvider.cancelSubscription(harness.pool, USER),
    ).resolves.toBe("canceled");
    expect(editedIds(fetchMock)).toEqual(["sub_retry"]);
    expect((await liveRow())[0]?.cancel_at_period_end).toBe(true);
  });
});

// ── data-21 ──────────────────────────────────────────────────────────────

describe("data-21: Plata user -> subscriptionId 1:N", () => {
  it("два checkout-и дають два мапінги, вебхук по першому id резолвиться", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    stubFetch();
    const input = {
      pool: harness.pool,
      user: { id: USER, email: null },
      plan: "pro" as const,
    };
    const first = await plataProvider.createCheckoutSession(input);
    const second = await plataProvider.createCheckoutSession(input);
    expect(first.sessionId).toBe("sub_new_1");
    expect(second.sessionId).toBe("sub_new_2");

    const { rows } = await harness.pool.query<{ subscription_id: string }>(
      `SELECT subscription_id FROM plata_subscription WHERE user_id = $1 ORDER BY subscription_id`,
      [USER],
    );
    expect(rows.map((r) => r.subscription_id)).toEqual([
      "sub_new_1",
      "sub_new_2",
    ]);

    // Оплачено ПЕРШУ сторінку: раніше вебхук за старим id не резолвився.
    await reconcileBySubscriptionId(harness.pool, "sub_new_1");
    const [row] = await liveRow();
    expect(row?.provider).toBe("plata");
    expect(row?.provider_subscription_id).toBe("sub_new_1");
    expect((await plataRow("sub_new_1"))?.confirmed_at).not.toBeNull();
    expect((await plataRow("sub_new_2"))?.confirmed_at).toBeNull();
  });

  it("невдача НЕоплаченого другого checkout-у не переводить живу підписку в past_due", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await seedLive({ provider: "plata", subscriptionId: "sub_live" });
    await seedPlataMapping("sub_live", { confirmed: true });
    await seedPlataMapping("sub_unpaid");
    // monobank: друга сторінка - з ознакою невдачі, перша - жива.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const id = new URL(String(input)).searchParams.get("subscriptionId");
        return Response.json({
          subscriptionId: id,
          status: "active",
          ...(id === "sub_unpaid"
            ? { walletData: { failureDescription: "no funds" } }
            : {}),
        });
      }),
    );

    await reconcileBySubscriptionId(harness.pool, "sub_unpaid");

    expect((await liveRow())[0]?.status).toBe("active");
  });

  it("активація другої Plata-підписки скасовує першу, а запізнілий вебхук по ній її не воскрешає", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const fetchMock = stubFetch();
    await seedLive({ provider: "plata", subscriptionId: "sub_first" });
    await seedPlataMapping("sub_first", { confirmed: true, ageMinutes: 30 });
    await seedPlataMapping("sub_second");

    await reconcileBySubscriptionId(harness.pool, "sub_second");

    expect(editedIds(fetchMock)).toEqual(["sub_first"]);
    const [row] = await liveRow();
    expect(row?.provider_subscription_id).toBe("sub_second");
    expect((await plataRow("sub_first"))?.superseded_at).not.toBeNull();

    // monobank ще показує `active` для скасованої першої: вебхук ігнорується.
    fetchMock.mockClear();
    await reconcileBySubscriptionId(harness.pool, "sub_first");
    expect(urlsOf(fetchMock)).toEqual([]);
    expect((await liveRow())[0]?.provider_subscription_id).toBe("sub_second");
  });

  it("активація Plata при живій LiqPay скасовує LiqPay (unsubscribe), а не мовчки перезаписує provider", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const fetchMock = stubFetch({ liqpayBody: { result: "ok" } });
    const order = encodeOrderId(USER);
    await seedLive({ provider: "liqpay", subscriptionId: order });
    await seedPlataMapping("sub_plata");

    await reconcileBySubscriptionId(harness.pool, "sub_plata");

    const liqpayCalls = urlsOf(fetchMock).filter((u) =>
      u.includes("liqpay.ua/api/request"),
    );
    expect(liqpayCalls).toHaveLength(1);
    const body = new URLSearchParams(
      String(
        (
          fetchMock.mock.calls.find((c) =>
            String(c[0]).includes("liqpay.ua/api/request"),
          )![1] as RequestInit
        ).body,
      ),
    );
    const sent = JSON.parse(
      Buffer.from(body.get("data")!, "base64").toString("utf8"),
    ) as { action: string; order_id: string };
    expect(sent).toMatchObject({ action: "unsubscribe", order_id: order });
    const [row] = await liveRow();
    expect(row?.provider).toBe("plata");
    expect(row?.provider_subscription_id).toBe("sub_plata");
  });

  it("активація LiqPay при живій Plata скасовує Plata і позначає її замінюваною", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const fetchMock = stubFetch();
    await seedLive({ provider: "plata", subscriptionId: "sub_p" });
    await seedPlataMapping("sub_p", { confirmed: true });

    const order = encodeOrderId(USER);
    await liqpayProvider.processWebhook(harness.pool, liqpayCallback(order));

    expect(editedIds(fetchMock)).toEqual(["sub_p"]);
    const [row] = await liveRow();
    expect(row?.provider).toBe("liqpay");
    expect(row?.provider_subscription_id).toBe(order);
    expect((await plataRow("sub_p"))?.superseded_at).not.toBeNull();
  });

  it("відмова скасувати стару підписку НЕ відкочує активацію нової: запис у черзі, ретрай добиває", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    stubFetch({ plataEditStatus: 500 });
    await seedLive({ provider: "plata", subscriptionId: "sub_a" });
    await seedPlataMapping("sub_a", { confirmed: true, ageMinutes: 30 });
    await seedPlataMapping("sub_b");

    await reconcileBySubscriptionId(harness.pool, "sub_b");

    // Людина заплатила за B: Pro є, хоч A скасувати не вдалось.
    expect((await liveRow())[0]?.provider_subscription_id).toBe("sub_b");
    expect((await plataRow("sub_b"))?.confirmed_at).not.toBeNull();
    // Стара позначена замінюваною одразу (запізнілий вебхук її не воскресить)...
    expect((await plataRow("sub_a"))?.superseded_at).not.toBeNull();
    // ...а скасування лишилось у черзі.
    expect(await pendingRow("plata", "sub_a")).toMatchObject({
      attempts: 1,
      resolved: false,
    });

    // monobank відновився: ретрай-полер (пауза між спробами вже минула).
    const fetchMock = stubFetch({ plataEditStatus: 200 });
    await harness.pool.query(
      `UPDATE billing_pending_cancellation SET last_attempt_at = NOW() - INTERVAL '2 hours'`,
    );
    await expect(retryPendingCancellations(harness.pool)).resolves.toEqual({
      processed: 1,
    });
    expect(editedIds(fetchMock)).toEqual(["sub_a"]);
    expect(await pendingRow("plata", "sub_a")).toMatchObject({
      attempts: 2,
      resolved: true,
    });
    expect((await liveRow())[0]?.provider_subscription_id).toBe("sub_b");
  });

  it("ретрай поважає паузу між спробами й не чіпає закриті записи", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    stubFetch({ plataEditStatus: 500 });
    await seedLive({ provider: "plata", subscriptionId: "sub_a" });
    await seedPlataMapping("sub_a", { confirmed: true, ageMinutes: 30 });
    await seedPlataMapping("sub_b");
    await reconcileBySubscriptionId(harness.pool, "sub_b");

    // Щойно була спроба - ще рано.
    await expect(retryPendingCancellations(harness.pool)).resolves.toEqual({
      processed: 0,
    });
  });

  it("стара LiqPay-підписка вже мертва (lapsed past_due, order_not_found): нова Plata все одно активується", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    // Період і grace минули, але рядок лишився 'past_due' - вічний, нічого його
    // не знімає (getUserPlan). Це і є "живий рядок" для findSupersededRecurrence.
    const oldOrder = encodeOrderId(USER);
    await seedLive({
      provider: "liqpay",
      subscriptionId: oldOrder,
      status: "past_due",
      periodEnd: "2020-01-01T00:00:00Z",
    });
    const fetchMock = stubFetch({
      liqpayBody: { result: "error", err_code: "order_not_found" },
    });
    await seedPlataMapping("sub_paid");

    await reconcileBySubscriptionId(harness.pool, "sub_paid");

    const [row] = await liveRow();
    expect(row).toMatchObject({
      provider: "plata",
      provider_subscription_id: "sub_paid",
      status: "active",
    });
    expect((await plataRow("sub_paid"))?.confirmed_at).not.toBeNull();
    expect(
      urlsOf(fetchMock).filter((u) => u.includes("liqpay.ua/api/request")),
    ).toHaveLength(1);
    // "Підписки вже нема" - це успіх, а не борг у черзі.
    expect(await pendingRow("liqpay", oldOrder)).toMatchObject({
      resolved: true,
    });
  });

  it("стара Plata-підписка: monobank 400 на edit і на remove - нова LiqPay активується, борг у черзі", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    stubFetch({ plataEditStatus: 400, plataRemoveStatus: 400 });
    await seedLive({
      provider: "plata",
      subscriptionId: "sub_dead",
      status: "past_due",
      periodEnd: "2020-01-01T00:00:00Z",
    });
    await seedPlataMapping("sub_dead", { confirmed: true, ageMinutes: 9999 });

    const order = encodeOrderId(USER);
    await liqpayProvider.processWebhook(harness.pool, liqpayCallback(order));

    const [row] = await liveRow();
    expect(row).toMatchObject({
      provider: "liqpay",
      provider_subscription_id: order,
      status: "active",
    });
    expect(await pendingRow("plata", "sub_dead")).toMatchObject({
      attempts: 1,
      resolved: false,
    });
  });

  it("старий провайдер без ключів (BillingConfigurationError): нова підписка активується, борг у черзі", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    stubFetch();
    const oldOrder = encodeOrderId(USER);
    await seedLive({ provider: "liqpay", subscriptionId: oldOrder });
    mockEnv["LIQPAY_PUBLIC_KEY"] = undefined;
    mockEnv["LIQPAY_PRIVATE_KEY"] = undefined;
    await seedPlataMapping("sub_new");

    await reconcileBySubscriptionId(harness.pool, "sub_new");

    expect((await liveRow())[0]?.provider_subscription_id).toBe("sub_new");
    expect(await pendingRow("liqpay", oldOrder)).toMatchObject({
      resolved: false,
    });
  });

  it("slow tick підбирає оплачений, але непідтверджений checkout поза вікном швидкого тіку", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const fetchMock = stubFetch();
    // У subscriptions тримається A; B оплачено, але вебхук/швидкий тік не
    // дійшли за першу годину, тож джойн по provider_subscription_id його не бачить.
    await seedLive({ provider: "plata", subscriptionId: "sub_a" });
    await seedPlataMapping("sub_a", { confirmed: true, ageMinutes: 9999 });
    await seedPlataMapping("sub_b", { ageMinutes: 180 });

    await expect(runSlowTick(harness.pool)).resolves.toMatchObject({
      processed: 1,
    });

    expect((await liveRow())[0]?.provider_subscription_id).toBe("sub_b");
    expect(editedIds(fetchMock)).toEqual(["sub_a"]);
    expect((await plataRow("sub_b"))?.confirmed_at).not.toBeNull();
  });

  it("slow tick не чіпає старі покинуті checkout-и (старші за вікно) і замінені", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const fetchMock = stubFetch();
    await seedPlataMapping("sub_ancient", { ageMinutes: 60 * 24 * 10 });
    await seedPlataMapping("sub_old_superseded", { ageMinutes: 180 });
    await harness.pool.query(
      `UPDATE plata_subscription SET superseded_at = NOW() WHERE subscription_id = 'sub_old_superseded'`,
    );

    await expect(runSlowTick(harness.pool)).resolves.toEqual({ processed: 0 });
    expect(urlsOf(fetchMock)).toEqual([]);
  });

  it("reverse trial (manual) активація не шле нічого провайдерам", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const fetchMock = stubFetch();
    await seedLive({ provider: "manual", status: "trialing" });
    await seedPlataMapping("sub_after_trial");

    await reconcileBySubscriptionId(harness.pool, "sub_after_trial");

    expect(editedIds(fetchMock)).toEqual([]);
    const [row] = await liveRow();
    expect(row?.provider).toBe("plata");
    expect(row?.status).toBe("active");
  });
});

describe("data-21: гейт checkout-у", () => {
  it("вільно, коли підписок немає або є лише reverse trial (manual)", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await expect(
      assertCheckoutAllowed(harness.pool, USER),
    ).resolves.toBeUndefined();
    await seedLive({ provider: "manual", status: "trialing" });
    await expect(
      assertCheckoutAllowed(harness.pool, USER),
    ).resolves.toBeUndefined();
  });

  it("409 ALREADY_SUBSCRIBED при діючому платному ентайтлменті", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await seedLive({ provider: "liqpay", subscriptionId: "o1" });
    await expect(
      assertCheckoutAllowed(harness.pool, USER),
    ).rejects.toMatchObject({
      status: 409,
      code: "ALREADY_SUBSCRIBED",
    });
  });

  it("не блокує, коли оплачений період минув (скасована підписка лишилась 'active')", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await seedLive({
      provider: "plata",
      subscriptionId: "s_old",
      cancelAtPeriodEnd: true,
      periodEnd: "2020-01-01T00:00:00Z",
    });
    await expect(
      assertCheckoutAllowed(harness.pool, USER),
    ).resolves.toBeUndefined();
  });

  it("409 CHECKOUT_PENDING для непідтвердженого checkout-у молодшого за годину, не для старого", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await seedPlataMapping("s_stale", { ageMinutes: 120 });
    await expect(
      assertCheckoutAllowed(harness.pool, USER),
    ).resolves.toBeUndefined();
    await seedPlataMapping("s_pending", { ageMinutes: 5 });
    await expect(
      assertCheckoutAllowed(harness.pool, USER),
    ).rejects.toMatchObject({
      status: 409,
      code: "CHECKOUT_PENDING",
    });
  });

  it("роут: другий POST /checkout поки перший не оплачено -> 409, monobank вдруге не викликається", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const fetchMock = stubFetch();
    const app = express();
    app.use(express.json());
    app.use(createBillingRouter({ pool: harness.pool }));
    app.use(errorHandler);

    const first = await request(app)
      .post("/api/billing/checkout")
      .set("x-vercel-ip-country", "UA")
      .send({ plan: "pro", provider: "plata" });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/billing/checkout")
      .set("x-vercel-ip-country", "UA")
      .send({ plan: "pro", provider: "plata" });
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ code: "CHECKOUT_PENDING" });
    expect(
      urlsOf(fetchMock).filter((u) => u.includes("/subscription/create")),
    ).toHaveLength(1);
  });

  it("роут: POST /checkout при діючій підписці -> 409 ALREADY_SUBSCRIBED", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const fetchMock = stubFetch();
    await seedLive({ provider: "liqpay", subscriptionId: "o2" });
    const app = express();
    app.use(express.json());
    app.use(createBillingRouter({ pool: harness.pool }));
    app.use(errorHandler);

    const res = await request(app)
      .post("/api/billing/checkout")
      .set("x-vercel-ip-country", "UA")
      .send({ plan: "pro", provider: "plata" });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "ALREADY_SUBSCRIBED" });
    expect(urlsOf(fetchMock)).toEqual([]);
  });

  it("роут: POST /cancel при відмові monobank -> 502 PROVIDER_CANCEL_FAILED, прапорця немає", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    stubFetch({ plataEditStatus: 500 });
    await seedLive({ provider: "plata", subscriptionId: "sub_route" });
    const app = express();
    app.use(express.json());
    app.use(createBillingRouter({ pool: harness.pool }));
    app.use(errorHandler);

    const res = await request(app).post("/api/billing/cancel").send({});

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ code: "PROVIDER_CANCEL_FAILED" });
    expect((await liveRow())[0]?.cancel_at_period_end).toBe(false);
  });
});

// ── термінальні події ЗАМІНЕНОЇ підписки не чіпають нову ─────────────────

describe("data-21: подія замінених Stripe/LiqPay-підписок не гасить нову", () => {
  const stripeCheckout = (id: string, sub: string) => ({
    id,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_${id}`,
        client_reference_id: USER,
        customer: "cus_1",
        subscription: sub,
        metadata: { plan: "pro" },
      },
    },
  });
  const stripeSubEvent = (
    id: string,
    type: string,
    sub: string,
    status: string,
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    type,
    data: {
      object: {
        id: sub,
        status,
        customer: "cus_1",
        metadata: { user_id: USER },
        current_period_end: 4_000_000_000,
        ...extra,
      },
    },
  });
  const send = (event: { id: string }) =>
    processStripeWebhook(
      harness.pool,
      event as never,
      Buffer.from(JSON.stringify(event)),
    );

  it("Stripe A -> B: customer.subscription.updated/deleted по sub_A лишають B активною", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const fetchMock = stubFetch();
    await seedLive({ provider: "stripe", subscriptionId: "sub_A" });

    await send(stripeCheckout("evt_chk_b", "sub_B"));
    expect(
      urlsOf(fetchMock).filter((u) => u.includes("/subscriptions/sub_A")),
    ).toHaveLength(1);
    expect((await liveRow())[0]?.provider_subscription_id).toBe("sub_B");

    // Те, що Stripe шле САМ після cancel_at_period_end на A, а в кінці
    // періоду - deleted. Раніше перша підміняла id/прапорець у рядку B,
    // друга гасила B.
    await send(
      stripeSubEvent(
        "evt_a_upd",
        "customer.subscription.updated",
        "sub_A",
        "active",
        {
          cancel_at_period_end: true,
        },
      ),
    );
    await send(
      stripeSubEvent(
        "evt_a_del",
        "customer.subscription.deleted",
        "sub_A",
        "canceled",
      ),
    );

    const rows = await liveRow();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: "stripe",
      provider_subscription_id: "sub_B",
      status: "active",
      cancel_at_period_end: false,
    });

    // Власні події B працюють як завжди.
    await send(
      stripeSubEvent(
        "evt_b_del",
        "customer.subscription.deleted",
        "sub_B",
        "canceled",
      ),
    );
    expect(await liveRow()).toHaveLength(0);
  });

  it("Stripe: subscription.updated чужої підписки не перебиває живий рядок іншого провайдера", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    stubFetch();
    const order = encodeOrderId(USER);
    await seedLive({ provider: "liqpay", subscriptionId: order });

    await send(
      stripeSubEvent(
        "evt_x_upd",
        "customer.subscription.updated",
        "sub_X",
        "active",
      ),
    );

    expect((await liveRow())[0]).toMatchObject({
      provider: "liqpay",
      provider_subscription_id: order,
    });
  });

  it("LiqPay X -> Y: unsubscribe/reversed/failure та запізніле списання по X не чіпають Y", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const fetchMock = stubFetch();
    const orderX = encodeOrderId(USER);
    const orderY = encodeOrderId(USER);
    await seedLive({ provider: "liqpay", subscriptionId: orderX });

    await liqpayProvider.processWebhook(harness.pool, liqpayCallback(orderY));
    expect(
      urlsOf(fetchMock).filter((u) => u.includes("liqpay.ua/api/request")),
    ).toHaveLength(1);
    expect((await liveRow())[0]?.provider_subscription_id).toBe(orderY);

    const cb = (order: string, status: string, action: string) =>
      encodeData({
        order_id: order,
        status,
        action,
        payment_id: `pay_${Math.random().toString(16).slice(2)}`,
      });
    // Підтвердження скасування X, повернення платежу X, невдале списання X.
    await liqpayProvider.processWebhook(
      harness.pool,
      cb(orderX, "unsubscribed", "unsubscribe"),
    );
    await liqpayProvider.processWebhook(
      harness.pool,
      cb(orderX, "reversed", "regular"),
    );
    await liqpayProvider.processWebhook(
      harness.pool,
      cb(orderX, "failure", "regular"),
    );
    // Запізніле УСПІШНЕ списання по вже заміненій X не витісняє Y.
    await liqpayProvider.processWebhook(
      harness.pool,
      cb(orderX, "success", "regular"),
    );

    const rows = await liveRow();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: "liqpay",
      provider_subscription_id: orderY,
      status: "active",
    });

    // Власний unsubscribe Y працює як завжди.
    await liqpayProvider.processWebhook(
      harness.pool,
      cb(orderY, "unsubscribed", "unsubscribe"),
    );
    expect(await liveRow()).toHaveLength(0);
  });
});

// ── міграція 154 ─────────────────────────────────────────────────────────

describe("міграція 154: plata_subscription 1:N", () => {
  const up = () =>
    fs.readFile(
      path.join(MIGRATIONS_DIR, "154_plata_subscription_one_to_many.sql"),
      "utf8",
    );
  const down = () =>
    fs.readFile(
      path.join(MIGRATIONS_DIR, "154_plata_subscription_one_to_many.down.sql"),
      "utf8",
    );

  it("PK на subscription_id, індекс на user_id, колонка superseded_at", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    const { rows } = await harness.pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'plata_subscription'::regclass AND contype = 'p'`,
    );
    expect(rows.map((r) => r.def)).toEqual(["PRIMARY KEY (subscription_id)"]);
    const idx = await harness.pool.query(
      `SELECT 1 FROM pg_indexes WHERE tablename = 'plata_subscription'
          AND indexname = 'plata_subscription_user_id_idx'`,
    );
    expect(idx.rowCount).toBe(1);
    const queue = await harness.pool.query(
      `SELECT to_regclass('billing_pending_cancellation') AS t`,
    );
    expect(queue.rows[0]?.t).toBe("billing_pending_cancellation");
  });

  it("backfill повертає id живої plata-підписки, якого немає в мапінгу; повторний прогін ідемпотентний", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await seedLive({ provider: "plata", subscriptionId: "sub_lost" });
    await seedPlataMapping("sub_overwriter");

    await harness.pool.query(await up());
    await harness.pool.query(await up());

    const { rows } = await harness.pool.query<{ subscription_id: string }>(
      `SELECT subscription_id FROM plata_subscription WHERE user_id = $1 ORDER BY 1`,
      [USER],
    );
    expect(rows.map((r) => r.subscription_id)).toEqual([
      "sub_lost",
      "sub_overwriter",
    ]);
  });

  it("down лишає один рядок на користувача (живу підписку), up відновлює 1:N", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await seedLive({ provider: "plata", subscriptionId: "sub_keep" });
    await seedPlataMapping("sub_keep", { confirmed: true, ageMinutes: 100 });
    await seedPlataMapping("sub_drop", { ageMinutes: 1 });

    await harness.pool.query(await down());
    const afterDown = await harness.pool.query<{ subscription_id: string }>(
      `SELECT subscription_id FROM plata_subscription WHERE user_id = $1`,
      [USER],
    );
    expect(afterDown.rows.map((r) => r.subscription_id)).toEqual(["sub_keep"]);
    const pk = await harness.pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'plata_subscription'::regclass AND contype = 'p'`,
    );
    expect(pk.rows[0]?.def).toBe("PRIMARY KEY (user_id)");

    await harness.pool.query(await up());
    await seedPlataMapping("sub_again");
    const afterUp = await harness.pool.query(
      `SELECT 1 FROM plata_subscription WHERE user_id = $1`,
      [USER],
    );
    expect(afterUp.rowCount).toBe(2);
  });
});
