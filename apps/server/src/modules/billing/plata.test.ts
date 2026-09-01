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

const { reconcileBySubscriptionIdMock } = vi.hoisted(() => ({
  reconcileBySubscriptionIdMock: vi.fn(),
}));
vi.mock("./plataSync.js", () => ({
  reconcileBySubscriptionId: reconcileBySubscriptionIdMock,
}));

import {
  __setPlataPubkeyForTesting,
  ensurePlataPubkey,
  parseSubscriptionIdFromWebhook,
  plataProvider,
} from "./plata.js";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "P-256",
});

function signBody(body: string): string {
  return crypto
    .sign("sha256", Buffer.from(body, "utf8"), privateKey)
    .toString("base64");
}

beforeEach(() => {
  __setPlataPubkeyForTesting(publicKey);
  reconcileBySubscriptionIdMock.mockReset();
});
afterEach(() => {
  __setPlataPubkeyForTesting(null);
  vi.restoreAllMocks();
});

describe("plata verifyWebhookSignature (ECDSA)", () => {
  it("accepts a body signed with the cached pubkey", () => {
    const body = JSON.stringify({ subscriptionId: "s1", status: "active" });
    expect(plataProvider.verifyWebhookSignature(body, signBody(body))).toBe(
      true,
    );
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ subscriptionId: "s1" });
    const sig = signBody(body);
    const tampered = JSON.stringify({ subscriptionId: "s2" });
    expect(plataProvider.verifyWebhookSignature(tampered, sig)).toBe(false);
  });

  it("fails closed when no pubkey is cached", () => {
    __setPlataPubkeyForTesting(null);
    const body = "{}";
    expect(plataProvider.verifyWebhookSignature(body, signBody(body))).toBe(
      false,
    );
  });
});

describe("parseSubscriptionIdFromWebhook (tolerant — chargeUrl/statusUrl payload undocumented)", () => {
  it("reads a top-level subscriptionId", () => {
    expect(
      parseSubscriptionIdFromWebhook(
        JSON.stringify({ subscriptionId: "s2_abc" }),
      ),
    ).toBe("s2_abc");
  });

  it("reads a nested data.subscriptionId", () => {
    expect(
      parseSubscriptionIdFromWebhook(
        JSON.stringify({ data: { subscriptionId: "s2_nested" } }),
      ),
    ).toBe("s2_nested");
  });

  it("returns null when no subscriptionId is found anywhere", () => {
    expect(parseSubscriptionIdFromWebhook(JSON.stringify({ foo: "bar" }))).toBe(
      null,
    );
  });

  it("returns null on unparseable JSON instead of throwing", () => {
    expect(parseSubscriptionIdFromWebhook("not json")).toBe(null);
  });
});

describe("plata processWebhook — triggers reconciliation, never writes subscriptions directly", () => {
  it("delegates to reconcileBySubscriptionId when subscriptionId is found", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = {} as any;
    await plataProvider.processWebhook(
      pool,
      JSON.stringify({ subscriptionId: "s2_1" }),
    );
    expect(reconcileBySubscriptionIdMock).toHaveBeenCalledWith(pool, "s2_1");
  });

  it("is a no-op (no reconcile call) when subscriptionId cannot be resolved", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = {} as any;
    await plataProvider.processWebhook(pool, JSON.stringify({ foo: "bar" }));
    expect(reconcileBySubscriptionIdMock).not.toHaveBeenCalled();
  });
});

describe("ensurePlataPubkey", () => {
  beforeEach(() => {
    mockEnv["PLATA_TOKEN"] = "merchant-token";
    __setPlataPubkeyForTesting(null);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and caches the pubkey from monopay", async () => {
    const derPubkey = publicKey.export({ type: "spki", format: "der" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ key: derPubkey.toString("base64") }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await ensurePlataPubkey();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.monobank.ua/api/merchant/pubkey",
      { headers: { "X-Token": "merchant-token" } },
    );
    const body = "{}";
    expect(plataProvider.verifyWebhookSignature(body, signBody(body))).toBe(
      true,
    );
  });

  it("throws when the pubkey fetch HTTP call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("err", { status: 500 })),
    );
    await expect(ensurePlataPubkey()).rejects.toThrow(
      "monopay pubkey fetch failed: HTTP 500",
    );
  });

  it("throws when the response body has no 'key' field", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    );
    await expect(ensurePlataPubkey()).rejects.toThrow(
      "monopay pubkey response missing 'key'",
    );
  });
});

function mockCheckoutPool() {
  const calls: { sql: string; params: unknown[] | undefined }[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return { rowCount: 1, rows: [] };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { pool: { query } as any, calls };
}

describe("plataProvider — checkout / portal / status", () => {
  beforeEach(() => {
    mockEnv["PLATA_TOKEN"] = "merchant-token";
    mockEnv["PRO_MONTHLY_UAH_KOPIYKAS"] = 39900;
    mockEnv["PLATA_MODE"] = "test";
    delete process.env["PUBLIC_WEB_BASE_URL"];
    delete process.env["VITE_PUBLIC_APP_URL"];
    delete process.env["BETTER_AUTH_URL"];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createCheckoutSession throws BillingConfigurationError when PLATA_TOKEN is unset", async () => {
    mockEnv["PLATA_TOKEN"] = undefined;
    const { pool } = mockCheckoutPool();
    await expect(
      plataProvider.createCheckoutSession({
        pool,
        user: { id: "usr_1" },
        plan: "pro",
      }),
    ).rejects.toThrow("PLATA_TOKEN is not set");
  });

  it("posts a correct subscription/create body (interval 1m, amount, both webHookUrls) and returns pageUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          subscriptionId: "s2_1",
          pageUrl: "https://pay.mbnk.biz/s2_1",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { pool } = mockCheckoutPool();

    const result = await plataProvider.createCheckoutSession({
      pool,
      user: { id: "usr_1" },
      plan: "pro",
    });

    expect(result).toEqual({
      ok: true,
      mode: "test",
      sessionId: "s2_1",
      url: "https://pay.mbnk.biz/s2_1",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.monobank.ua/api/merchant/subscription/create",
    );
    expect((init.headers as Record<string, string>)["X-Token"]).toBe(
      "merchant-token",
    );
    const body = JSON.parse(init.body as string) as {
      amount: number;
      interval: string;
      webHookUrls: { chargeUrl: string; statusUrl: string };
    };
    expect(body.amount).toBe(39900);
    expect(body.interval).toBe("1m");
    expect(body.webHookUrls.chargeUrl).toContain("/api/billing/plata-charge");
    expect(body.webHookUrls.statusUrl).toContain("/api/billing/plata-status");
  });

  it("writes plata_subscription BEFORE returning the response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            subscriptionId: "s2_2",
            pageUrl: "https://pay.mbnk.biz/s2_2",
          }),
          { status: 200 },
        ),
      ),
    );
    const { pool, calls } = mockCheckoutPool();

    await plataProvider.createCheckoutSession({
      pool,
      user: { id: "usr_2" },
      plan: "pro",
    });

    const insert = calls.find((c) =>
      c.sql.includes("INSERT INTO plata_subscription"),
    );
    expect(insert).toBeDefined();
    expect(insert?.params).toEqual(["usr_2", "s2_2"]);
  });

  it("throws with the monopay error text on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errText: "invalid amount" }), {
          status: 400,
        }),
      ),
    );
    const { pool } = mockCheckoutPool();
    await expect(
      plataProvider.createCheckoutSession({
        pool,
        user: { id: "usr_1" },
        plan: "pro",
      }),
    ).rejects.toThrow("invalid amount");
  });

  it("createCustomerPortalSession returns the in-app settings URL", async () => {
    const { pool } = mockCheckoutPool();
    const result = await plataProvider.createCustomerPortalSession({
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
          id: 7,
          provider: "plata",
          plan: "pro",
          status: "active",
          current_period_end: "2026-08-01T00:00:00.000Z",
        },
      ],
    });
    const result = await plataProvider.getSubscriptionStatus(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { query } as any,
      "usr_1",
    );
    expect(result.subscription.id).toBe(7);
    expect(result.subscription.active).toBe(true);
    expect(result.subscription.currentPeriodEnd).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("getSubscriptionStatus returns the null shape with no rows", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const result = await plataProvider.getSubscriptionStatus(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { query } as any,
      "usr_1",
    );
    expect(result.subscription.active).toBe(false);
  });
});

describe("plataProvider.cancelSubscription", () => {
  beforeEach(() => {
    mockEnv["PLATA_TOKEN"] = "merchant-token";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockCancelPool(subscriptionId: string | null) {
    const calls: { sql: string; params: unknown[] | undefined }[] = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT subscription_id FROM plata_subscription")) {
        return {
          rows: subscriptionId ? [{ subscription_id: subscriptionId }] : [],
        };
      }
      return { rowCount: 1, rows: [] };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { pool: { query } as any, calls };
  }

  it("sends action:cancel WITHOUT refundAmount, then marks cancel_at_period_end", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { pool, calls } = mockCancelPool("s2_cancel");

    await plataProvider.cancelSubscription(pool, "usr_1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.monobank.ua/api/merchant/subscription/edit");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({ subscriptionId: "s2_cancel", action: "cancel" });
    expect(body["refundAmount"]).toBeUndefined();
    const cancelUpdate = calls.find((c) =>
      c.sql.includes("cancel_at_period_end = TRUE"),
    );
    expect(cancelUpdate).toBeDefined();
  });

  it("falls back to subscription/remove on 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { pool } = mockCancelPool("s2_404");

    await plataProvider.cancelSubscription(pool, "usr_1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [removeUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(removeUrl).toBe(
      "https://api.monobank.ua/api/merchant/subscription/remove",
    );
  });

  it("is a no-op (no fetch, no DB row change) when there is nothing left to cancel", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { pool, calls } = mockCancelPool(null);

    await plataProvider.cancelSubscription(pool, "usr_1");

    expect(fetchMock).not.toHaveBeenCalled();
    // WHERE-guard on the UPDATE makes a repeat call on an already-cancelled
    // subscription a no-op at the SQL level (0 rows affected) — the query
    // itself still runs, but no provider call happens without a stored
    // subscriptionId.
    const cancelUpdate = calls.find((c) =>
      c.sql.includes("cancel_at_period_end = TRUE"),
    );
    expect(cancelUpdate).toBeDefined();
  });

  it("swallows a network error from monobank (best-effort) and still marks locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    const { pool, calls } = mockCancelPool("s2_err");

    await expect(
      plataProvider.cancelSubscription(pool, "usr_1"),
    ).resolves.toBeUndefined();
    expect(
      calls.some((c) => c.sql.includes("cancel_at_period_end = TRUE")),
    ).toBe(true);
  });
});
