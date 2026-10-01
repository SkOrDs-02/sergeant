import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionUserMock, mockEnv } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  // Tests need to flip STRIPE_SECRET_KEY / STRIPE_PRICE_ID_PRO_MONTHLY at
  // runtime, but `stripe.ts` reads them through `env.STRIPE_SECRET_KEY`
  // (Zod-validated `env` module snapshot — frozen at module load). Mutating
  // `process.env` in `beforeEach` would not propagate into that snapshot, so
  // tests would always see `env.STRIPE_SECRET_KEY === undefined` and get
  // 503 `BILLING_UNAVAILABLE` even when they explicitly set the key.
  //
  // Stub the `env` module with a Proxy backed by a hoisted `mockEnv` map —
  // matches the n8n.test.ts pattern. `process.env` is still kept in sync
  // so direct reads (`getAppBaseUrl()` in stripe.ts, anything else that
  // bypasses the Zod env) see the same value.
  mockEnv: {} as Record<string, string>,
}));

vi.mock("../auth.js", () => ({
  getSessionUser: getSessionUserMock,
}));

// Знімок доступу має власні тести (`modules/billing/accessSnapshot.test.ts`);
// тут перевіряємо лише, що роут кладе його поруч із `subscription`.
const ACCESS = {
  state: "free",
  trialEndsAt: null,
  graceEndsAt: null,
  features: { "export.pdf": false },
  meters: {
    aiActions: { used: 0, limit: 20, resetsAt: "2026-06-14T21:00:00.000Z" },
    aiPhoto: { used: 0, limit: 3, resetsAt: "2026-06-14T21:00:00.000Z" },
    finykVision: { used: 0, limit: 5, resetsAt: "2026-06-14T21:00:00.000Z" },
  },
};
vi.mock("../modules/billing/accessSnapshot.js", () => ({
  buildAccessSnapshot: vi.fn(async () => ACCESS),
}));
const accessIn = (state: string) => ({ ...ACCESS, state });

vi.mock("../env/env.js", () => ({
  env: new Proxy(
    {},
    {
      get(_target, prop: string) {
        return mockEnv[prop] ?? undefined;
      },
    },
  ),
}));

// Гейт вікна видалення в `requireSession` ходить у глобальний пул за
// міткою; цей тест його не мокає, тож без заглушки маршрут падав у 500.
vi.mock("../modules/me/dataRights.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../modules/me/dataRights.js")>()),
  getAccountDeletionStatus: vi.fn(async () => ({ pending: false })),
}));

vi.mock("../http/rateLimit.js", async () => {
  const actual = await vi.importActual<typeof import("../http/rateLimit.js")>(
    "../http/rateLimit.js",
  );
  return {
    ...actual,
    rateLimitExpress: () => (_req: unknown, _res: unknown, next: () => void) =>
      next(),
  };
});

function setEnv(key: string, value: string): void {
  mockEnv[key] = value;
  process.env[key] = value;
}

function unsetEnv(key: string): void {
  delete mockEnv[key];
  delete process.env[key];
}

import {
  BillingPortalResponseSchema,
  BillingStatusResponseSchema,
} from "@sergeant/shared";

import { createBillingRouter } from "./billing.js";
import { buildAccessSnapshot } from "../modules/billing/accessSnapshot.js";
import { getUserPlan } from "../modules/billing/index.js";

function createQueryPool(query: ReturnType<typeof vi.fn>) {
  return {
    query,
    connect: vi.fn(),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
}

function createTestApp(pool: ReturnType<typeof createQueryPool>) {
  const app = express();
  app.use(express.json());
  app.use(createBillingRouter({ pool: pool as never }));
  return app;
}

describe("billing routes", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    getSessionUserMock.mockReset();
    getSessionUserMock.mockResolvedValue({
      id: "user_1",
      email: "billing@example.com",
    });
    unsetEnv("STRIPE_SECRET_KEY");
    unsetEnv("STRIPE_PRICE_ID_PLUS_MONTHLY");
    unsetEnv("STRIPE_PRICE_ID_PRO_MONTHLY");
    unsetEnv("STRIPE_WEBHOOK_SECRET");
    unsetEnv("PUBLIC_WEB_BASE_URL");
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("validates checkout plan before Stripe is called", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = createTestApp(createQueryPool(query));

    const res = await request(app)
      .post("/api/billing/checkout")
      .send({ plan: "enterprise" });

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns BILLING_UNAVAILABLE when Stripe env is missing", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = createTestApp(createQueryPool(query));

    // Non-UA geo → resolver picks Stripe (dormant для UA лише); Stripe env
    // відсутній у тесті → BillingConfigurationError → 503. Для UA-юзера з
    // вимкненими флагами відповідь була б 400 PROVIDER_UNAVAILABLE.
    const res = await request(app)
      .post("/api/billing/checkout")
      .set("x-vercel-ip-country", "US")
      .send({ plan: "plus" });

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: "BILLING_UNAVAILABLE" });
  });

  it("serializes active subscription ids as numbers", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "42",
          provider: "stripe",
          plan: "pro",
          status: "active",
          current_period_end: new Date("2026-06-01T00:00:00.000Z"),
        },
      ],
    });
    const app = createTestApp(createQueryPool(query));

    vi.mocked(buildAccessSnapshot).mockResolvedValueOnce(
      accessIn("pro") as never,
    );
    const res = await request(app).get("/api/billing/status");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      subscription: {
        id: 42,
        provider: "stripe",
        plan: "pro",
        status: "active",
        active: true,
        currentPeriodEnd: "2026-06-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
      },
      access: accessIn("pro"),
    });
  });

  it("coerces a Postgres bigint and preserves trialing contract fields", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 42n,
          provider: "liqpay",
          plan: "pro",
          status: "trialing",
          current_period_end: null,
        },
      ],
    });
    const app = createTestApp(createQueryPool(query));

    vi.mocked(buildAccessSnapshot).mockResolvedValueOnce(
      accessIn("trial") as never,
    );
    const res = await request(app).get("/api/billing/status");

    expect(res.status).toBe(200);
    expect(BillingStatusResponseSchema.parse(res.body)).toEqual({
      subscription: {
        id: 42,
        provider: "liqpay",
        plan: "pro",
        status: "trialing",
        active: true,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
      access: accessIn("trial"),
    });
  });

  it("exposes the cancel_at_period_end column as cancelAtPeriodEnd (and defaults a missing column to false)", async () => {
    const baseRow = {
      id: 9,
      provider: "liqpay",
      plan: "pro",
      status: "active",
      current_period_end: new Date("2026-06-01T00:00:00.000Z"),
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ ...baseRow, cancel_at_period_end: true }],
      })
      .mockResolvedValueOnce({ rows: [baseRow] });
    const app = createTestApp(createQueryPool(query));

    const scheduled = await request(app).get("/api/billing/status");
    expect(scheduled.status).toBe(200);
    expect(scheduled.body.subscription.cancelAtPeriodEnd).toBe(true);

    const legacyRow = await request(app).get("/api/billing/status");
    expect(legacyRow.status).toBe(200);
    expect(legacyRow.body.subscription.cancelAtPeriodEnd).toBe(false);
  });

  // ── Round-2 UI audit S1: founder bypass must match getUserPlan() ────
  // Root cause was this route reading `subscriptions` directly while
  // `requirePlan()` read `getUserPlan()` — a founder passed the gate but
  // still saw the paywall because this route never checked the allowlist.
  it("GET /status reports active: false once the trial has lapsed", async () => {
    // Рядок `trialing` лишається в таблиці після кінця trial; `active`
    // дзеркалить стан доступу, а не сам статус рядка.
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 7,
          provider: "manual",
          plan: "pro",
          status: "trialing",
          current_period_end: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });
    const app = createTestApp(createQueryPool(query));

    const res = await request(app).get("/api/billing/status");

    expect(res.status).toBe(200);
    expect(res.body.subscription).toMatchObject({
      status: "trialing",
      active: false,
    });
    expect(res.body.access.state).toBe("free");
  });

  it("GET /status grants a synthetic pro subscription to a founder id", async () => {
    setEnv("AI_QUOTA_FOUNDER_IDS", "founder_1,founder_2");
    getSessionUserMock.mockResolvedValue({
      id: "founder_2",
      email: "founder@example.com",
    });
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = createTestApp(createQueryPool(query));

    vi.mocked(buildAccessSnapshot).mockResolvedValueOnce(
      accessIn("pro") as never,
    );
    const res = await request(app).get("/api/billing/status");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      subscription: {
        id: null,
        provider: "manual",
        plan: "pro",
        status: "active",
        active: true,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
      access: accessIn("pro"),
    });
    // Founder never needs the DB — same short-circuit as getUserPlan().
    expect(query).not.toHaveBeenCalled();
    unsetEnv("AI_QUOTA_FOUNDER_IDS");
  });

  it("GET /status still reads subscriptions for a non-founder even when the allowlist is set", async () => {
    setEnv("AI_QUOTA_FOUNDER_IDS", "founder_1");
    getSessionUserMock.mockResolvedValue({
      id: "user_1",
      email: "billing@example.com",
    });
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = createTestApp(createQueryPool(query));

    const res = await request(app).get("/api/billing/status");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      subscription: {
        id: null,
        provider: null,
        plan: null,
        status: null,
        active: false,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
      access: ACCESS,
    });
    expect(query).toHaveBeenCalled();
    unsetEnv("AI_QUOTA_FOUNDER_IDS");
  });

  // ───────── POST /api/billing/portal (P0-6) ─────────
  // Happy path: user with an active Stripe subscription gets a fresh
  // Customer Portal URL. Edge cases:
  //  - Stripe env missing → 503 BILLING_UNAVAILABLE (mirrors checkout).
  //  - No subscription / no provider_customer_id → 409 NO_BILLING_CUSTOMER.
  // We mock global `fetch` so the test never hits Stripe's network.

  it("creates a Customer Portal session and returns a redirect URL", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test_123");
    setEnv("PUBLIC_WEB_BASE_URL", "https://app.example.com");

    const query = vi.fn().mockResolvedValue({
      rows: [{ provider_customer_id: "cus_xyz" }],
    });
    const fetchMock: typeof fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "bps_test_1",
            url: "https://billing.stripe.com/session/bps_test_1",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    globalThis.fetch = fetchMock;

    const app = createTestApp(createQueryPool(query));
    const res = await request(app).post("/api/billing/portal");

    expect(res.status).toBe(200);
    // API contract triplet (Hard Rule #3): response shape must round-trip
    // through the canonical zod schema that ships in @sergeant/shared.
    const parsed = BillingPortalResponseSchema.parse(res.body);
    expect(parsed).toEqual({
      ok: true,
      url: "https://billing.stripe.com/session/bps_test_1",
    });

    const calls = vi.mocked(fetchMock).mock.calls;
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("fetchMock was not called");
    const [stripeUrl, init] = call;
    expect(String(stripeUrl)).toBe(
      "https://api.stripe.com/v1/billing_portal/sessions",
    );
    const body = String(init?.body ?? "");
    expect(body).toContain("customer=cus_xyz");
    expect(body).toContain(
      `return_url=${encodeURIComponent("https://app.example.com/settings?billing=portal-return")}`,
    );
  });

  it("returns BILLING_UNAVAILABLE when Stripe env is missing", async () => {
    // Portal тепер читає провайдера з ВЛАСНОЇ підписки юзера (bug_018 fix);
    // немає рядка → fallback на geo → stripe → env відсутній → 503.
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = createTestApp(createQueryPool(query));

    const res = await request(app).post("/api/billing/portal");

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: "BILLING_UNAVAILABLE" });
  });

  it("returns NO_BILLING_CUSTOMER when user has no Stripe customer record", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test_123");
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const fetchMock: typeof fetch = vi.fn(async () => new Response(null));
    globalThis.fetch = fetchMock;

    const app = createTestApp(createQueryPool(query));
    const res = await request(app).post("/api/billing/portal");

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "NO_BILLING_CUSTOMER" });
    // No Stripe API call when we know the user has no customer record.
    expect(vi.mocked(fetchMock)).not.toHaveBeenCalled();
  });

  // ── Phase 7 UA billing: multi-provider routes ──────────────────────
  it("GET /providers lists enabled UA providers by geo", async () => {
    setEnv("LIQPAY_ENABLED", "true");
    setEnv("PLATA_ENABLED", "true");
    const app = createTestApp(createQueryPool(vi.fn()));

    const res = await request(app)
      .get("/api/billing/providers")
      .set("x-vercel-ip-country", "UA");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ providers: ["liqpay", "plata"] });
  });

  it("checkout with provider=liqpay returns a LiqPay checkout URL", async () => {
    setEnv("LIQPAY_ENABLED", "true");
    setEnv("LIQPAY_PUBLIC_KEY", "sandbox_i123");
    setEnv("LIQPAY_PRIVATE_KEY", "sandbox_priv");
    setEnv("PRO_MONTHLY_UAH_KOPIYKAS", "19900");
    const app = createTestApp(createQueryPool(vi.fn()));

    const res = await request(app)
      .post("/api/billing/checkout")
      .set("x-vercel-ip-country", "UA")
      .send({ plan: "pro", provider: "liqpay" });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("test"); // sandbox_ public key
    expect(String(res.body.url)).toContain("liqpay.ua");
  });

  it("rejects provider=stripe for a UA user with 400 PROVIDER_UNAVAILABLE", async () => {
    setEnv("LIQPAY_ENABLED", "true");
    const app = createTestApp(createQueryPool(vi.fn()));

    const res = await request(app)
      .post("/api/billing/checkout")
      .set("x-vercel-ip-country", "UA")
      .send({ plan: "pro", provider: "stripe" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  // ── POST /api/billing/cancel ───────────────────────────────────────
  // Регресія «Скасувати Premium нічого не робить»: роут завжди віддавав
  // `{ok:true}`, навіть коли жоден провайдер нічого не скасував, а помилки
  // провайдерів ковтав у `logger.warn`. Тепер «нічого скасовувати» — 409,
  // «провайдер не підтвердив» — 502, а `cancel_at_period_end` стає видимим
  // у `/status`.
  describe("POST /cancel", () => {
    interface FakeSubscriptionRow {
      id: string;
      provider: string;
      plan: string;
      status: string;
      current_period_end: Date;
      provider_subscription_id: string | null;
      cancel_at_period_end: boolean;
    }

    /**
     * Пул-симулятор з однією LiqPay-підпискою: розрізняє SQL провайдерів за
     * `provider = '…'` і справді мутує рядок, щоб `GET /status` після cancel
     * читав те, що записав cancel (а не окремий мок).
     */
    function createSubscriptionPool(
      overrides: Partial<FakeSubscriptionRow> | null,
    ) {
      const row: FakeSubscriptionRow | null = overrides
        ? {
            id: "42",
            provider: "liqpay",
            plan: "pro",
            status: "active",
            current_period_end: new Date("2099-01-01T00:00:00.000Z"),
            provider_subscription_id: "srg_abc_1",
            cancel_at_period_end: false,
            ...overrides,
          }
        : null;
      const query = vi.fn(async (sql: string) => {
        const s = sql.replace(/\s+/g, " ");
        if (s.includes("UPDATE subscriptions")) {
          if (row && s.includes(`provider = '${row.provider}'`)) {
            row.cancel_at_period_end = true;
            return { rowCount: 1, rows: [] };
          }
          return { rowCount: 0, rows: [] };
        }
        if (s.includes("FROM plata_subscription")) return { rows: [] };
        if (s.includes("FROM subscriptions")) {
          // cancel-SELECT конкретного провайдера → лише його рядок;
          // status-SELECT (`ORDER BY CASE …`) → останній рядок юзера.
          const scoped = /provider = '(\w+)'/.exec(s)?.[1];
          if (scoped && row?.provider !== scoped) return { rows: [] };
          return { rows: row ? [row] : [] };
        }
        return { rows: [] };
      });
      return { row, query, pool: createQueryPool(query) };
    }

    function stubLiqpayEnv(): void {
      setEnv("LIQPAY_PUBLIC_KEY", "sandbox_i123");
      setEnv("LIQPAY_PRIVATE_KEY", "sandbox_priv");
    }

    function liqpayResponds(body: unknown, status = 200) {
      const fetchMock = vi.fn(
        async () =>
          new Response(typeof body === "string" ? body : JSON.stringify(body), {
            status,
          }),
      );
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      return fetchMock;
    }

    afterEach(() => {
      unsetEnv("LIQPAY_PUBLIC_KEY");
      unsetEnv("LIQPAY_PRIVATE_KEY");
      unsetEnv("AI_QUOTA_FOUNDER_IDS");
    });

    it("returns 409 NO_ACTIVE_SUBSCRIPTION when no provider has anything to cancel", async () => {
      const { pool } = createSubscriptionPool(null);
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const res = await request(createTestApp(pool)).post(
        "/api/billing/cancel",
      );

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: "NO_ACTIVE_SUBSCRIPTION" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns 409 for a founder: the synthetic manual Pro has no row to cancel", async () => {
      setEnv("AI_QUOTA_FOUNDER_IDS", "user_1");
      const { pool } = createSubscriptionPool(null);

      const res = await request(createTestApp(pool)).post(
        "/api/billing/cancel",
      );

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: "NO_ACTIVE_SUBSCRIPTION" });
    });

    it("returns 409 for a manual grant (provider='manual' is nobody's to cancel)", async () => {
      const { pool, row } = createSubscriptionPool({
        provider: "manual",
        provider_subscription_id: null,
      });

      const res = await request(createTestApp(pool)).post(
        "/api/billing/cancel",
      );

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: "NO_ACTIVE_SUBSCRIPTION" });
      expect(row?.cancel_at_period_end).toBe(false);
    });

    it("returns 502 PROVIDER_CANCEL_FAILED when LiqPay reports an error with HTTP 200, and leaves the row alone", async () => {
      stubLiqpayEnv();
      const { pool, row } = createSubscriptionPool({});
      liqpayResponds({
        result: "error",
        status: "error",
        err_code: "order_not_found",
        err_description: "order not found",
      });

      const res = await request(createTestApp(pool)).post(
        "/api/billing/cancel",
      );

      expect(res.status).toBe(502);
      expect(res.body).toMatchObject({ code: "PROVIDER_CANCEL_FAILED" });
      // Провайдер відмовив → локально нічого не позначаємо скасованим.
      expect(row?.cancel_at_period_end).toBe(false);
    });

    it("returns 502 PROVIDER_CANCEL_FAILED when LiqPay answers with HTTP 5xx", async () => {
      stubLiqpayEnv();
      const { pool, row } = createSubscriptionPool({});
      liqpayResponds("Bad Gateway", 502);

      const res = await request(createTestApp(pool)).post(
        "/api/billing/cancel",
      );

      expect(res.status).toBe(502);
      expect(res.body).toMatchObject({ code: "PROVIDER_CANCEL_FAILED" });
      expect(row?.cancel_at_period_end).toBe(false);
    });

    it("cancels via LiqPay and /status then reports cancelAtPeriodEnd: true", async () => {
      stubLiqpayEnv();
      const { pool, row } = createSubscriptionPool({});
      const fetchMock = liqpayResponds({
        result: "ok",
        status: "unsubscribed",
      });
      const app = createTestApp(pool);

      const before = await request(app).get("/api/billing/status");
      expect(before.body.subscription.cancelAtPeriodEnd).toBe(false);

      const res = await request(app).post("/api/billing/cancel");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(row?.cancel_at_period_end).toBe(true);

      vi.mocked(buildAccessSnapshot).mockResolvedValueOnce(
        accessIn("pro") as never,
      );
      const after = await request(app).get("/api/billing/status");
      expect(after.status).toBe(200);
      const parsed = BillingStatusResponseSchema.parse(after.body);
      expect(parsed.subscription).toMatchObject({
        status: "active",
        active: true,
        cancelAtPeriodEnd: true,
      });
    });

    it("is idempotent: cancelling an already cancel_at_period_end subscription returns ok without calling LiqPay again", async () => {
      stubLiqpayEnv();
      const { pool } = createSubscriptionPool({ cancel_at_period_end: true });
      const fetchMock = liqpayResponds({
        result: "ok",
        status: "unsubscribed",
      });

      const res = await request(createTestApp(pool)).post(
        "/api/billing/cancel",
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // Термін дії підписки. `getUserPlan()` — джерело істини для `requirePlan()`
  // і AI-квоти, тож саме його запит має відсікати прострочені рядки: статус
  // сам по собі ніколи не змінюється (cancel_at_period_end і past_due
  // лишаються назавжди), а бета-доступи видаються з `current_period_end` у
  // майбутньому і мають закриватися самі. Мок-пул не виконує SQL, тож
  // перевіряємо саме предикат — фільтрує Postgres, не JS.
  it("getUserPlan only counts a subscription while its period is still running", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const plan = await getUserPlan(createQueryPool(query) as never, "user_1");

    expect(plan.plan).toBe("free");
    expect(String(query.mock.calls[0]?.[0])).toContain(
      "current_period_end IS NULL OR current_period_end > NOW()",
    );
  });

  it("liqpay-callback with missing signature → 400 (no processing)", async () => {
    const query = vi.fn();
    const app = createTestApp(createQueryPool(query));

    const res = await request(app)
      .post("/api/billing/liqpay-callback")
      .send("data=abc"); // signature missing

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
