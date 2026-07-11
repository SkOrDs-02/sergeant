import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
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
    const { pool, calls } = mockPool(0); // billing_webhook_events INSERT → 0 rows
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
});
