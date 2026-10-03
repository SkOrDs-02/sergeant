/**
 * Юніт-тести на два баги запису статусу підписки, знайдені на живій схемі
 * (аудит 2026-09-16):
 *
 *  1. **Скасування не скасовувало.** `customer.subscription.deleted` ішов
 *     тим самим `INSERT ... ON CONFLICT (user_id) WHERE status IN
 *     ('active','trialing','past_due')`, що й активація. Арбітр там —
 *     частковий унікальний індекс `subscriptions_user_active_idx`, тож рядок
 *     зі `status='canceled'` у нього не входить, конфлікту не дає і лягає
 *     ДРУГИМ рядком: старий `active` лишається, `getUserPlan` далі бачить Pro.
 *  2. **Статус поза CHECK робив вебхук poison-pill.** `unpaid`, `paused`,
 *     `incomplete_expired` і власний літерал `"unknown"` не проходять
 *     `subscriptions_status_check` (m056) → 23514 → ROLLBACK відкочує і
 *     рядок ідемпотентності → Stripe ретраїть 3 доби → подія не
 *     обробиться ніколи.
 *
 * Мок пулу дзеркалить `stripe.test.ts` (`connect` → клієнт із `query`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../obs/logger.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../obs/logger.js")>();
  return { ...actual, logger: loggerMock };
});

import {
  mapStripeSubscriptionStatus,
  processStripeWebhook,
} from "./stripeWebhook.js";
import { __setPostHogCaptureForTesting } from "./stripeShared.js";
import type { capturePostHogEvent } from "../../lib/posthogCapture.js";

function createClient() {
  const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
  return { query, release: vi.fn() };
}

function subscriptionEvent(type: string, status: string | null) {
  const object: Record<string, unknown> = {
    id: "sub_1",
    metadata: { user_id: "user_1", plan: "pro" },
    customer: "cus_1",
  };
  if (status !== null) object["status"] = status;
  return { id: `evt_${type}_${status ?? "missing"}`, type, data: { object } };
}

/** SQL-виклики клієнта без службових BEGIN/COMMIT/ROLLBACK. */
function sqlCalls(client: ReturnType<typeof createClient>): string[] {
  return client.query.mock.calls
    .map((c) => String(c[0]))
    .filter((sql) => !["BEGIN", "COMMIT", "ROLLBACK"].includes(sql));
}

beforeEach(() => {
  __setPostHogCaptureForTesting(
    vi.fn().mockResolvedValue({
      outcome: "ok",
    }) as unknown as typeof capturePostHogEvent,
  );
});

afterEach(() => {
  __setPostHogCaptureForTesting(null);
  vi.clearAllMocks();
});

describe("mapStripeSubscriptionStatus — Stripe-статус → домен m056", () => {
  it("пропускає статуси, які CHECK і так дозволяє", () => {
    expect(mapStripeSubscriptionStatus("active")).toBe("active");
    expect(mapStripeSubscriptionStatus("trialing")).toBe("trialing");
    expect(mapStripeSubscriptionStatus("past_due")).toBe("past_due");
    expect(mapStripeSubscriptionStatus("canceled")).toBe("canceled");
    expect(mapStripeSubscriptionStatus("incomplete")).toBe("incomplete");
  });

  it("unpaid → past_due (дунінг триває, підписку Stripe ще не закрив)", () => {
    expect(mapStripeSubscriptionStatus("unpaid")).toBe("past_due");
  });

  it("incomplete_expired → canceled", () => {
    expect(mapStripeSubscriptionStatus("incomplete_expired")).toBe("canceled");
  });

  it("paused → canceled", () => {
    expect(mapStripeSubscriptionStatus("paused")).toBe("canceled");
  });

  it("невідоме значення → incomplete + warn із фактичним статусом", () => {
    expect(mapStripeSubscriptionStatus("unknown")).toBe("incomplete");
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "stripe_webhook_unknown_subscription_status",
        status: "unknown",
      }),
    );
  });

  it("відсутній статус → incomplete + warn зі status: null", () => {
    expect(mapStripeSubscriptionStatus(null)).toBe("incomplete");
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "stripe_webhook_unknown_subscription_status",
        status: null,
      }),
    );
  });
});

describe("customer.subscription.deleted — скасування гасить активний рядок", () => {
  it("пише явним UPDATE по активному набору, а не через upsert", async () => {
    const client = createClient();
    const pool = { connect: vi.fn().mockResolvedValue(client) };

    await processStripeWebhook(
      pool as never,
      subscriptionEvent("customer.subscription.deleted", "canceled"),
      Buffer.from("{}"),
    );

    const sql = sqlCalls(client);
    const subscriptionWrites = sql.filter((s) => s.includes("subscriptions"));
    expect(subscriptionWrites).toHaveLength(1);
    const write = subscriptionWrites[0]!;
    // Жодного INSERT — саме він створював другий рядок і лишав Pro живим.
    expect(write).not.toContain("INSERT INTO subscriptions");
    expect(write).toContain("UPDATE subscriptions");
    expect(write).toContain("status = $2");
    expect(write).toContain("provider = 'stripe'");
    expect(write).toContain("status IN ('active', 'trialing', 'past_due')");

    const params = client.query.mock.calls.find((c) =>
      String(c[0]).includes("UPDATE subscriptions"),
    )?.[1] as unknown[];
    expect(params).toEqual(["user_1", "canceled"]);
    expect(client.query).toHaveBeenLastCalledWith("COMMIT");
  });

  it("paused теж іде термінальним UPDATE (мапиться в canceled)", async () => {
    const client = createClient();
    const pool = { connect: vi.fn().mockResolvedValue(client) };

    await processStripeWebhook(
      pool as never,
      subscriptionEvent("customer.subscription.updated", "paused"),
      Buffer.from("{}"),
    );

    const write = sqlCalls(client).find((s) => s.includes("subscriptions"))!;
    expect(write).toContain("UPDATE subscriptions");
    const params = client.query.mock.calls.find((c) =>
      String(c[0]).includes("UPDATE subscriptions"),
    )?.[1] as unknown[];
    expect(params?.[1]).toBe("canceled");
  });

  it("incomplete_expired теж іде термінальним UPDATE", async () => {
    const client = createClient();
    const pool = { connect: vi.fn().mockResolvedValue(client) };

    await processStripeWebhook(
      pool as never,
      subscriptionEvent("customer.subscription.updated", "incomplete_expired"),
      Buffer.from("{}"),
    );

    const params = client.query.mock.calls.find((c) =>
      String(c[0]).includes("UPDATE subscriptions"),
    )?.[1] as unknown[];
    expect(params?.[1]).toBe("canceled");
  });
});

describe("не-термінальні статуси лишаються на upsert-шляху зі значенням із CHECK", () => {
  it("unpaid пишеться як past_due, а не як 'unpaid' (інакше 23514)", async () => {
    const client = createClient();
    const pool = { connect: vi.fn().mockResolvedValue(client) };

    await processStripeWebhook(
      pool as never,
      subscriptionEvent("customer.subscription.updated", "unpaid"),
      Buffer.from("{}"),
    );

    const call = client.query.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO subscriptions"),
    );
    expect(call).toBeDefined();
    expect((call?.[1] as unknown[])[2]).toBe("past_due");
  });

  it("відсутній статус пишеться як incomplete, а не як літерал 'unknown'", async () => {
    const client = createClient();
    const pool = { connect: vi.fn().mockResolvedValue(client) };

    await processStripeWebhook(
      pool as never,
      subscriptionEvent("customer.subscription.created", null),
      Buffer.from("{}"),
    );

    const call = client.query.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO subscriptions"),
    );
    expect((call?.[1] as unknown[])[2]).toBe("incomplete");
  });

  it("active лишається upsert-ом (активація не змінилась)", async () => {
    const client = createClient();
    const pool = { connect: vi.fn().mockResolvedValue(client) };

    await processStripeWebhook(
      pool as never,
      subscriptionEvent("customer.subscription.created", "active"),
      Buffer.from("{}"),
    );

    const sql = sqlCalls(client);
    expect(sql.some((s) => s.includes("INSERT INTO subscriptions"))).toBe(true);
    expect(sql.some((s) => s.includes("UPDATE subscriptions"))).toBe(false);
  });
});
