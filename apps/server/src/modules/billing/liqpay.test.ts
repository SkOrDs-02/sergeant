import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockEnv = vi.hoisted(() => ({}) as Record<string, any>);
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
  decodeUserIdFromOrderId,
  encodeData,
  encodeOrderId,
  liqpayProvider,
  parseCallbackData,
  signData,
} from "./liqpay.js";

describe("liqpay signature", () => {
  it("computes base64(sha1(private + data + private))", () => {
    const priv = "priv_key_123";
    const data = "eyJhIjoxfQ==";
    const expected = crypto
      .createHash("sha1")
      .update(priv + data + priv, "utf8")
      .digest("base64");
    expect(signData(data, priv)).toBe(expected);
  });

  it("changes when data or key changes (tamper-evident)", () => {
    expect(signData("aaa", "k")).not.toBe(signData("aab", "k"));
    expect(signData("aaa", "k1")).not.toBe(signData("aaa", "k2"));
  });
});

describe("liqpay order_id ↔ userId", () => {
  it("round-trips a Better Auth opaque user id", () => {
    const userId = "usr_AbC-123_xyz";
    const orderId = encodeOrderId(userId);
    expect(orderId.startsWith("srg_")).toBe(true);
    expect(decodeUserIdFromOrderId(orderId)).toBe(userId);
  });

  it("produces a unique nonce per checkout for the same user", () => {
    expect(encodeOrderId("u")).not.toBe(encodeOrderId("u"));
  });

  it("returns null for non-Sergeant / malformed order ids", () => {
    expect(decodeUserIdFromOrderId("stripe_cs_test_123")).toBeNull();
    expect(decodeUserIdFromOrderId("srg")).toBeNull();
    expect(decodeUserIdFromOrderId("")).toBeNull();
  });
});

describe("liqpay parseCallbackData", () => {
  it("decodes base64 JSON into a callback object", () => {
    const data = encodeData({
      status: "success",
      action: "pay",
      order_id: "x",
    });
    expect(parseCallbackData(data)).toEqual({
      status: "success",
      action: "pay",
      order_id: "x",
    });
  });
});

const TX_KEYWORDS = ["BEGIN", "COMMIT", "ROLLBACK"];

interface MockPoolOptions {
  /** rowCount дедуп-INSERT-у: 0 = повторна доставка. */
  webhookInsertRowCount?: number;
  /** Рядки, які віддає SELECT «чи був уже reversed/unsubscribe». */
  cancellationRows?: unknown[];
  /** Підрядок SQL, на якому мок кидає — для перевірки ROLLBACK-у. */
  failOn?: string;
}

/**
 * `processWebhook` тепер бере `pool.connect()` і працює однією транзакцією
 * (дзеркало `processStripeWebhook`), тож мок віддає і `query`, і `connect`.
 * Обидва пишуть в один `calls`, щоб наявні перевірки лишились чинними.
 */
function mockPool(options: MockPoolOptions = {}) {
  const calls: { sql: string; params: unknown[] | undefined }[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (TX_KEYWORDS.includes(sql)) return { rowCount: 0, rows: [] };
    if (options.failOn && sql.includes(options.failOn)) {
      throw new Error("db exploded mid-processing");
    }
    if (sql.includes("INSERT INTO billing_webhook_events")) {
      return {
        rowCount: options.webhookInsertRowCount ?? 1,
        rows: [{ id: 1 }],
      };
    }
    if (sql.includes("FROM billing_webhook_events")) {
      const rows = options.cancellationRows ?? [];
      return { rowCount: rows.length, rows };
    }
    return { rowCount: 1, rows: [] };
  });
  const client = { query, release: vi.fn() };
  return {
    pool: {
      query,
      connect: vi.fn().mockResolvedValue(client),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    calls,
    client,
  };
}

describe("liqpay processWebhook", () => {
  const userId = "usr_42";
  const orderId = encodeOrderId(userId);

  it("activates the subscription on a success callback", async () => {
    const { pool, calls } = mockPool();
    const data = encodeData({
      status: "success",
      action: "subscribe",
      order_id: orderId,
      payment_id: 9001,
    });
    await liqpayProvider.processWebhook(pool, data);
    const upsert = calls.find((c) =>
      c.sql.includes("INSERT INTO subscriptions"),
    );
    expect(upsert).toBeDefined();
    expect(upsert?.sql).toContain("'active'");
    expect(upsert?.params?.[0]).toBe(userId);
  });

  it("cancels on an unsubscribe callback", async () => {
    const { pool, calls } = mockPool();
    const data = encodeData({
      status: "success",
      action: "unsubscribe",
      order_id: orderId,
      payment_id: 9002,
    });
    await liqpayProvider.processWebhook(pool, data);
    const cancel = calls.find(
      (c) =>
        c.sql.includes("UPDATE subscriptions") && c.sql.includes("canceled"),
    );
    expect(cancel).toBeDefined();
  });

  it("marks past_due on a recurring failure", async () => {
    const { pool, calls } = mockPool();
    const data = encodeData({
      status: "failure",
      action: "regular",
      order_id: orderId,
      payment_id: 9003,
    });
    await liqpayProvider.processWebhook(pool, data);
    const pastDue = calls.find((c) => c.sql.includes("past_due"));
    expect(pastDue).toBeDefined();
  });

  it("skips processing on a duplicate delivery (dedup)", async () => {
    const { pool, calls } = mockPool({ webhookInsertRowCount: 0 }); // дедуп → 0 rows
    const data = encodeData({
      status: "success",
      action: "subscribe",
      order_id: orderId,
      payment_id: 9004,
    });
    await liqpayProvider.processWebhook(pool, data);
    expect(calls.some((c) => c.sql.includes("INSERT INTO subscriptions"))).toBe(
      false,
    );
  });

  it("ignores callbacks whose order_id is not ours", async () => {
    const { pool, calls } = mockPool();
    const data = encodeData({ status: "success", order_id: "foreign_123" });
    await liqpayProvider.processWebhook(pool, data);
    expect(calls.length).toBe(0);
  });

  it("is a no-op when order_id is entirely missing from the callback", async () => {
    const { pool, calls } = mockPool();
    const data = encodeData({ status: "success" });
    await liqpayProvider.processWebhook(pool, data);
    expect(calls.length).toBe(0);
  });

  it("does nothing (no subscription write) while status is a 3DS pending state", async () => {
    const { pool, calls } = mockPool();
    const data = encodeData({
      status: "wait_secure",
      action: "subscribe",
      order_id: orderId,
      payment_id: 9005,
    });
    await liqpayProvider.processWebhook(pool, data);
    expect(
      calls.some(
        (c) =>
          c.sql.includes("INSERT INTO subscriptions") ||
          c.sql.includes("UPDATE subscriptions"),
      ),
    ).toBe(false);
    // The webhook-event row is still recorded for idempotency.
    expect(calls.some((c) => c.sql.includes("billing_webhook_events"))).toBe(
      true,
    );
  });

  it("cancels on a reversed status even without an unsubscribe action", async () => {
    const { pool, calls } = mockPool();
    const data = encodeData({
      status: "reversed",
      order_id: orderId,
      payment_id: 9006,
    });
    await liqpayProvider.processWebhook(pool, data);
    const cancel = calls.find(
      (c) =>
        c.sql.includes("UPDATE subscriptions") && c.sql.includes("canceled"),
    );
    expect(cancel).toBeDefined();
  });

  it("falls back to order_id:status:action as the dedup event id when no payment/transaction id is present", async () => {
    const { pool, calls } = mockPool();
    const data = encodeData({
      status: "success",
      action: "subscribe",
      order_id: orderId,
      // no payment_id / transaction_id
    });
    await liqpayProvider.processWebhook(pool, data);
    const insertEvent = calls.find((c) =>
      c.sql.includes("billing_webhook_events"),
    );
    expect(insertEvent?.params?.[0]).toBe(`${orderId}:success:subscribe`);
  });
});

/**
 * Транзакційність (фікс аудиту 2026-09-16). Доти дедуп-INSERT ішов окремим
 * автокоміт-ним `pool.query` ДО обробки: падіння після нього залишало
 * «вже оброблено» назавжди, LiqPay на ретраї діставав 200, підписка не
 * активувалась ніколи — а гроші вже списані.
 */
describe("liqpay processWebhook — одна транзакція на дедуп + обробку", () => {
  const userId = "usr_tx";
  const orderId = encodeOrderId(userId);

  it("обгортає дедуп-INSERT і обробку в BEGIN/COMMIT", async () => {
    const { pool, calls, client } = mockPool();
    await liqpayProvider.processWebhook(
      pool,
      encodeData({
        status: "success",
        action: "subscribe",
        order_id: orderId,
        payment_id: 7001,
      }),
    );
    const sqls = calls.map((c) => c.sql);
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls).toContain("COMMIT");
    expect(sqls).not.toContain("ROLLBACK");
    // Дедуп-рядок пишеться ВСЕРЕДИНІ транзакції, не до неї.
    expect(sqls.indexOf("BEGIN")).toBeLessThan(
      sqls.findIndex((sql) =>
        sql.includes("INSERT INTO billing_webhook_events"),
      ),
    );
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("ROLLBACK знімає дедуп-рядок, коли обробка падає — ретрай провайдера повторить роботу", async () => {
    const { pool, calls, client } = mockPool({
      failOn: "INSERT INTO subscriptions",
    });
    await expect(
      liqpayProvider.processWebhook(
        pool,
        encodeData({
          status: "success",
          action: "subscribe",
          order_id: orderId,
          payment_id: 7002,
        }),
      ),
    ).rejects.toThrow("db exploded mid-processing");

    const sqls = calls.map((c) => c.sql);
    expect(sqls).toContain("ROLLBACK");
    expect(sqls).not.toContain("COMMIT");
    // Дедуп-INSERT був — але відкотився разом із транзакцією.
    expect(
      sqls.some((sql) => sql.includes("INSERT INTO billing_webhook_events")),
    ).toBe(true);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("повторна доставка комітить порожню транзакцію і відпускає клієнта", async () => {
    const { pool, calls, client } = mockPool({ webhookInsertRowCount: 0 });
    await liqpayProvider.processWebhook(
      pool,
      encodeData({
        status: "success",
        action: "subscribe",
        order_id: orderId,
        payment_id: 7003,
      }),
    );
    expect(calls.map((c) => c.sql)).toContain("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

/**
 * Порядок доставки LiqPay не гарантований. Гілка скасування — це
 * `UPDATE ... WHERE status IN (активні)`, тож без активного рядка вона тихий
 * no-op; наступний `success` спокійно вставляв місяць Pro за скасований
 * платіж. Дедуп по `payment_id` не рятує — це РІЗНІ події.
 */
describe("liqpay processWebhook — reversed раніше за success", () => {
  const userId = "usr_race";
  const orderId = encodeOrderId(userId);

  /** Мок із реальним сховищем `billing_webhook_events` — перевіряє ПОРЯДОК. */
  function statefulPool() {
    const events: { eventType: string; orderId: string }[] = [];
    const calls: { sql: string; params: unknown[] | undefined }[] = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (TX_KEYWORDS.includes(sql)) return { rowCount: 0, rows: [] };
      if (sql.includes("INSERT INTO billing_webhook_events")) {
        const payload = JSON.parse(String(params?.[2])) as {
          order_id?: string;
        };
        const eventType = String(params?.[1]);
        if (events.some((e) => e.eventType === eventType)) {
          return { rowCount: 0, rows: [] };
        }
        events.push({ eventType, orderId: payload.order_id ?? "" });
        return { rowCount: 1, rows: [{ id: events.length }] };
      }
      if (sql.includes("FROM billing_webhook_events")) {
        const target = String(params?.[0]);
        const hit = events.filter(
          (e) =>
            e.orderId === target &&
            (e.eventType.startsWith("unsubscribe:") ||
              e.eventType.endsWith(":reversed")),
        );
        return {
          rowCount: hit.length,
          rows: hit.map(() => ({ "?column?": 1 })),
        };
      }
      return { rowCount: 1, rows: [] };
    });
    const client = { query, release: vi.fn() };
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pool: { query, connect: vi.fn().mockResolvedValue(client) } as any,
      calls,
    };
  }

  it("не активує підписку, коли reversed для того самого order_id уже записаний", async () => {
    const { pool, calls } = statefulPool();

    await liqpayProvider.processWebhook(
      pool,
      encodeData({ status: "reversed", order_id: orderId, payment_id: 8001 }),
    );
    await liqpayProvider.processWebhook(
      pool,
      encodeData({
        status: "success",
        action: "subscribe",
        order_id: orderId,
        payment_id: 8002,
      }),
    );

    expect(calls.some((c) => c.sql.includes("INSERT INTO subscriptions"))).toBe(
      false,
    );
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "liqpay_success_after_cancellation_ignored",
        orderId,
      }),
    );
  });

  it("активує, коли скасування для цього order_id не було", async () => {
    const { pool, calls } = statefulPool();
    await liqpayProvider.processWebhook(
      pool,
      encodeData({
        status: "success",
        action: "subscribe",
        order_id: orderId,
        payment_id: 8003,
      }),
    );
    expect(calls.some((c) => c.sql.includes("INSERT INTO subscriptions"))).toBe(
      true,
    );
  });
});

/**
 * `sandbox` — статус тестового платежу, за яким не стоїть жодної гривні.
 * Поки він лежав у `SUCCESS_STATUSES` беззастережно, будь-який такий
 * callback на бойових ключах видавав місяць Pro безкоштовно.
 */
describe("liqpay processWebhook — status:sandbox", () => {
  const userId = "usr_sandbox";
  const orderId = encodeOrderId(userId);

  afterEach(() => {
    delete mockEnv["LIQPAY_PUBLIC_KEY"];
  });

  it("на бойовому ключі НЕ активує підписку і не збиває її в past_due", async () => {
    mockEnv["LIQPAY_PUBLIC_KEY"] = "i00000001";
    const { pool, calls } = mockPool();
    await liqpayProvider.processWebhook(
      pool,
      encodeData({
        status: "sandbox",
        action: "pay",
        order_id: orderId,
        payment_id: 6001,
      }),
    );
    expect(
      calls.some(
        (c) =>
          c.sql.includes("INSERT INTO subscriptions") ||
          c.sql.includes("UPDATE subscriptions"),
      ),
    ).toBe(false);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "liqpay_sandbox_status_on_live_keys",
        orderId,
      }),
    );
  });

  it("без налаштованих ключів теж не активує (безпечний бік помилки)", async () => {
    const { pool, calls } = mockPool();
    await liqpayProvider.processWebhook(
      pool,
      encodeData({
        status: "sandbox",
        action: "pay",
        order_id: orderId,
        payment_id: 6002,
      }),
    );
    expect(calls.some((c) => c.sql.includes("INSERT INTO subscriptions"))).toBe(
      false,
    );
  });

  it("на sandbox-ключі активує, як і раніше (тестовий контур лишається робочим)", async () => {
    mockEnv["LIQPAY_PUBLIC_KEY"] = "sandbox_i00000001";
    const { pool, calls } = mockPool();
    await liqpayProvider.processWebhook(
      pool,
      encodeData({
        status: "sandbox",
        action: "pay",
        order_id: orderId,
        payment_id: 6003,
      }),
    );
    const upsert = calls.find((c) =>
      c.sql.includes("INSERT INTO subscriptions"),
    );
    expect(upsert).toBeDefined();
    expect(upsert?.params?.[0]).toBe(userId);
  });
});

describe("liqpayProvider — checkout / portal / status", () => {
  beforeEach(() => {
    mockEnv["LIQPAY_PUBLIC_KEY"] = "sandbox_pub_123";
    mockEnv["LIQPAY_PRIVATE_KEY"] = "priv_123";
    mockEnv["PRO_MONTHLY_UAH_KOPIYKAS"] = 39900;
    delete process.env["PUBLIC_WEB_BASE_URL"];
    delete process.env["VITE_PUBLIC_APP_URL"];
    delete process.env["BETTER_AUTH_URL"];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createCheckoutSession throws BillingConfigurationError when keys are unset", async () => {
    mockEnv["LIQPAY_PUBLIC_KEY"] = undefined;
    mockEnv["LIQPAY_PRIVATE_KEY"] = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = {} as any;
    await expect(
      liqpayProvider.createCheckoutSession({
        pool,
        user: { id: "usr_1" },
        plan: "pro",
      }),
    ).rejects.toThrow("LIQPAY_PUBLIC_KEY / LIQPAY_PRIVATE_KEY are not set");
  });

  it("createCheckoutSession builds a signed sandbox checkout URL encoding the userId in order_id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = {} as any;
    const result = await liqpayProvider.createCheckoutSession({
      pool,
      user: { id: "usr_1" },
      plan: "pro",
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("test"); // sandbox_ prefix → test mode
    expect(result.sessionId.startsWith("srg_")).toBe(true);
    expect(decodeUserIdFromOrderId(result.sessionId)).toBe("usr_1");
    expect(result.url).toContain("https://www.liqpay.ua/api/3/checkout?data=");
    expect(result.url).toContain("&signature=");
  });

  it("createCheckoutSession reports live mode for a non-sandbox public key", async () => {
    mockEnv["LIQPAY_PUBLIC_KEY"] = "i00000001";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = {} as any;
    const result = await liqpayProvider.createCheckoutSession({
      pool,
      user: { id: "usr_1" },
      plan: "pro",
    });
    expect(result.mode).toBe("live");
  });

  it("createCustomerPortalSession returns the in-app settings URL (no real portal)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = {} as any;
    const result = await liqpayProvider.createCustomerPortalSession({
      pool,
      user: { id: "usr_1" },
    });
    expect(result).toEqual({
      ok: true,
      url: "http://localhost:5173/settings?billing=manage",
    });
  });

  it("getSubscriptionStatus serializes the latest subscription row", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "5",
          provider: "liqpay",
          plan: "pro",
          status: "active",
          current_period_end: new Date("2026-08-01T00:00:00.000Z"),
        },
      ],
    });
    const result = await liqpayProvider.getSubscriptionStatus(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { query } as any,
      "usr_1",
    );
    expect(result).toEqual({
      subscription: {
        id: 5,
        provider: "liqpay",
        plan: "pro",
        status: "active",
        active: true,
        currentPeriodEnd: "2026-08-01T00:00:00.000Z",
      },
    });
  });

  it("getSubscriptionStatus returns the null shape with no rows", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const result = await liqpayProvider.getSubscriptionStatus(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { query } as any,
      "usr_1",
    );
    expect(result.subscription.active).toBe(false);
    expect(result.subscription.id).toBeNull();
  });

  it("verifyWebhookSignature validates a signature computed with the same private key", () => {
    const payload = encodeData({ status: "success" });
    const sig = signData(payload, "priv_123");
    expect(liqpayProvider.verifyWebhookSignature(payload, sig)).toBe(true);
    expect(liqpayProvider.verifyWebhookSignature(payload, "bogus")).toBe(false);
  });
});

describe("liqpayProvider.cancelSubscription", () => {
  beforeEach(() => {
    mockEnv["LIQPAY_PUBLIC_KEY"] = "sandbox_pub_123";
    mockEnv["LIQPAY_PRIVATE_KEY"] = "priv_123";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a no-op when the user has no active LiqPay subscription", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await liqpayProvider.cancelSubscription({ query } as any, "usr_1");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("unsubscribes via LiqPay then marks cancel_at_period_end", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ provider_subscription_id: "srg_abc_1" }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("OK", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await liqpayProvider.cancelSubscription({ query } as any, "usr_1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://www.liqpay.ua/api/request");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("data")).toBeTruthy();
    expect(body.get("signature")).toBeTruthy();

    expect(query).toHaveBeenCalledTimes(2);
    const [updateSql, updateParams] = query.mock.calls[1] as [
      string,
      unknown[],
    ];
    expect(updateSql).toContain("cancel_at_period_end = TRUE");
    expect(updateParams).toEqual(["usr_1"]);
  });

  it("throws when the LiqPay unsubscribe HTTP call fails", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [{ provider_subscription_id: "srg_abc_1" }] });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("err", { status: 500 })),
    );
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      liqpayProvider.cancelSubscription({ query } as any, "usr_1"),
    ).rejects.toThrow("LiqPay unsubscribe failed: HTTP 500");
  });
});
