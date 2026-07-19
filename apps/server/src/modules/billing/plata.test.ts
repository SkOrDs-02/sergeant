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

import { encryptToken } from "../mono/crypto.js";
import {
  __setPlataPubkeyForTesting,
  ensurePlataPubkey,
  parsePlataWebhook,
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
  process.env["MONO_TOKEN_ENC_KEY"] = "a".repeat(64);
  __setPlataPubkeyForTesting(publicKey);
});
afterEach(() => {
  __setPlataPubkeyForTesting(null);
  vi.restoreAllMocks();
});

describe("plata verifyWebhookSignature (ECDSA)", () => {
  it("accepts a body signed with the cached pubkey", () => {
    const body = JSON.stringify({ invoiceId: "inv1", status: "success" });
    expect(plataProvider.verifyWebhookSignature(body, signBody(body))).toBe(
      true,
    );
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ invoiceId: "inv1", status: "success" });
    const sig = signBody(body);
    const tampered = JSON.stringify({ invoiceId: "inv1", status: "failure" });
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

describe("plata parsePlataWebhook", () => {
  it("parses the monopay webhook body", () => {
    const wh = parsePlataWebhook(
      JSON.stringify({ invoiceId: "i", status: "success", reference: "u1" }),
    );
    expect(wh.invoiceId).toBe("i");
    expect(wh.reference).toBe("u1");
  });
});

function mockPool(webhookInsertRowCount = 1) {
  const calls: { sql: string; params: unknown[] | undefined }[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes("billing_webhook_events")) {
      return { rowCount: webhookInsertRowCount, rows: [] };
    }
    return { rowCount: 1, rows: [] };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { pool: { query } as any, calls };
}

describe("plata processWebhook", () => {
  it("stores the encrypted card token and activates on success", async () => {
    const { pool, calls } = mockPool();
    await plataProvider.processWebhook(
      pool,
      JSON.stringify({
        invoiceId: "inv9",
        status: "success",
        reference: "usr_1",
        walletData: { cardToken: "tok_secret", walletId: "wal_1" },
      }),
    );
    const tokenInsert = calls.find((c) =>
      c.sql.includes("INSERT INTO plata_card_token"),
    );
    expect(tokenInsert).toBeDefined();
    // ciphertext must NOT be the plaintext token
    expect(tokenInsert?.params?.[2]).not.toBe("tok_secret");
    const activate = calls.find(
      (c) =>
        c.sql.includes("INSERT INTO subscriptions") &&
        c.sql.includes("'active'"),
    );
    expect(activate).toBeDefined();
  });

  it("marks past_due on a failed invoice", async () => {
    const { pool, calls } = mockPool();
    await plataProvider.processWebhook(
      pool,
      JSON.stringify({
        invoiceId: "inv9",
        status: "failure",
        reference: "usr_1",
      }),
    );
    expect(calls.some((c) => c.sql.includes("past_due"))).toBe(true);
  });

  it("skips duplicate deliveries (dedup)", async () => {
    const { pool, calls } = mockPool(0);
    await plataProvider.processWebhook(
      pool,
      JSON.stringify({
        invoiceId: "inv9",
        status: "success",
        reference: "usr_1",
      }),
    );
    expect(calls.some((c) => c.sql.includes("INSERT INTO subscriptions"))).toBe(
      false,
    );
  });

  it("is a no-op when invoiceId or reference (userId) is missing", async () => {
    const { pool, calls } = mockPool();
    await plataProvider.processWebhook(
      pool,
      JSON.stringify({ status: "success", reference: "usr_1" }), // no invoiceId
    );
    await plataProvider.processWebhook(
      pool,
      JSON.stringify({ invoiceId: "inv9", status: "success" }), // no reference
    );
    expect(calls.length).toBe(0);
  });

  it("waits (no subscription write) on an intermediate status like 'processing'", async () => {
    const { pool, calls } = mockPool();
    await plataProvider.processWebhook(
      pool,
      JSON.stringify({
        invoiceId: "inv9",
        status: "processing",
        reference: "usr_1",
      }),
    );
    expect(
      calls.some(
        (c) =>
          c.sql.includes("INSERT INTO subscriptions") ||
          c.sql.includes("UPDATE subscriptions"),
      ),
    ).toBe(false);
    // Still recorded for idempotency.
    expect(calls.some((c) => c.sql.includes("billing_webhook_events"))).toBe(
      true,
    );
  });

  it("marks past_due on expired and reversed invoices too", async () => {
    for (const status of ["expired", "reversed"]) {
      const { pool, calls } = mockPool();
      await plataProvider.processWebhook(
        pool,
        JSON.stringify({
          invoiceId: `inv_${status}`,
          status,
          reference: "usr_1",
        }),
      );
      expect(calls.some((c) => c.sql.includes("past_due"))).toBe(true);
    }
  });

  it("activates without storing a card token when walletData is absent", async () => {
    const { pool, calls } = mockPool();
    await plataProvider.processWebhook(
      pool,
      JSON.stringify({
        invoiceId: "inv9",
        status: "success",
        reference: "usr_1",
      }),
    );
    expect(
      calls.some((c) => c.sql.includes("INSERT INTO plata_card_token")),
    ).toBe(false);
    expect(
      calls.some(
        (c) =>
          c.sql.includes("INSERT INTO subscriptions") &&
          c.sql.includes("'active'"),
      ),
    ).toBe(true);
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
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
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
    // The cached key now verifies signatures correctly.
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = {} as any;
    await expect(
      plataProvider.createCheckoutSession({
        pool,
        user: { id: "usr_1" },
        plan: "pro",
      }),
    ).rejects.toThrow("PLATA_TOKEN is not set");
  });

  it("createCheckoutSession posts to monopay invoice/create and returns the invoice URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          invoiceId: "inv_1",
          pageUrl: "https://pay.mbnk.biz/inv_1",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = {} as any;

    const result = await plataProvider.createCheckoutSession({
      pool,
      user: { id: "usr_1" },
      plan: "pro",
    });

    expect(result).toEqual({
      ok: true,
      mode: "test",
      sessionId: "inv_1",
      url: "https://pay.mbnk.biz/inv_1",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.monobank.ua/api/merchant/invoice/create");
    expect((init.headers as Record<string, string>)["X-Token"]).toBe(
      "merchant-token",
    );
    const body = JSON.parse(init.body as string) as {
      merchantPaymInfo: { reference: string };
      amount: number;
    };
    expect(body.merchantPaymInfo.reference).toBe("usr_1");
    expect(body.amount).toBe(39900);
  });

  it("createCheckoutSession throws with the monopay error text on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errText: "invalid amount" }), {
          status: 400,
        }),
      ),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = {} as any;
    await expect(
      plataProvider.createCheckoutSession({
        pool,
        user: { id: "usr_1" },
        plan: "pro",
      }),
    ).rejects.toThrow("invalid amount");
  });

  it("createCustomerPortalSession returns the in-app settings URL", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = {} as any;
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
    process.env["MONO_TOKEN_ENC_KEY"] = "a".repeat(64);
    mockEnv["PLATA_TOKEN"] = "merchant-token";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deletes the local card token and marks cancel_at_period_end (no wallet card to revoke)", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // SELECT card token — none stored
      .mockResolvedValueOnce({ rows: [] }) // DELETE plata_card_token
      .mockResolvedValueOnce({ rows: [] }); // UPDATE subscriptions
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await plataProvider.cancelSubscription({ query } as any, "usr_1");

    expect(fetchSpy).not.toHaveBeenCalled(); // no card token → no wallet/card DELETE
    expect(query).toHaveBeenCalledTimes(3);
    const [deleteSql] = query.mock.calls[1] as [string, unknown[]];
    expect(deleteSql).toContain("DELETE FROM plata_card_token");
    const [updateSql, updateParams] = query.mock.calls[2] as [
      string,
      unknown[],
    ];
    expect(updateSql).toContain("cancel_at_period_end = TRUE");
    expect(updateParams).toEqual(["usr_1"]);
  });

  it("decrypts and best-effort revokes the wallet card token, then still cancels", async () => {
    const enc = encryptToken("card_tok_1", "a".repeat(64));
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            card_token_ciphertext: enc.ciphertext,
            card_token_iv: enc.iv,
            card_token_tag: enc.tag,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("OK", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await plataProvider.cancelSubscription({ query } as any, "usr_1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.monobank.ua/api/merchant/wallet/card");
    expect(init.method).toBe("DELETE");
    const body = JSON.parse(init.body as string) as { cardToken: string };
    expect(body.cardToken).toBe("card_tok_1");
  });

  it("swallows a failed wallet/card DELETE (best-effort) and still cancels locally", async () => {
    const enc = encryptToken("card_tok_2", "a".repeat(64));
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            card_token_ciphertext: enc.ciphertext,
            card_token_iv: enc.iv,
            card_token_tag: enc.tag,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plataProvider.cancelSubscription({ query } as any, "usr_1"),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(3);
  });
});
