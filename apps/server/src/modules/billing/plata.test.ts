import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setPlataPubkeyForTesting,
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
});
