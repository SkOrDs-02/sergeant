/**
 * PR-28 — `recordWebhookEvent` pure-helper unit tests.
 *
 * Тут перевіряємо логіку, яка НЕ потребує реального Postgres-а:
 *   * `sanitizeHeaders` — allowlist + case-insensitive + array-join.
 *   * payload size cap — `PayloadTooLargeError`.
 *   * headers size cap — `HeadersTooLargeError`.
 *   * SQL-shape — INSERT передається з 4 args, RETURNING повертає id+received_at.
 *   * bigint coercion (Hard Rule #1) — string id з pg coerc-иться у number.
 *
 * Інтеграційне покриття (real Postgres → real INSERT → real index +
 * retention) живе у `apps/server/src/migrations/__tests__/060-n8n-webhook-events.test.ts`.
 */

import { describe, it, expect, vi } from "vitest";
import type { Pool, QueryResult, QueryResultRow } from "pg";
import {
  HeadersTooLargeError,
  MAX_HEADERS_BYTES,
  MAX_PAYLOAD_BYTES,
  PayloadTooLargeError,
  recordWebhookEvent,
  sanitizeHeaders,
  SAFE_HEADER_ALLOWLIST,
} from "./recordWebhookEvent.js";

function mockPool<R extends QueryResultRow>(rows: R[]): Pool {
  return {
    query: vi.fn().mockResolvedValue({
      rows,
      rowCount: rows.length,
      command: "INSERT",
      oid: 0,
      fields: [],
    } satisfies QueryResult<R>),
  } as unknown as Pool;
}

describe("sanitizeHeaders", () => {
  it("drops everything outside the allowlist", () => {
    const out = sanitizeHeaders({
      authorization: "Bearer secret-token",
      cookie: "session=abc",
      "x-mono-webhook-secret": "shh",
      "x-api-key": "evil",
      "content-type": "application/json",
      "x-request-id": "req-1",
    });
    expect(out).toEqual({
      "content-type": "application/json",
      "x-request-id": "req-1",
    });
    expect(out).not.toHaveProperty("authorization");
    expect(out).not.toHaveProperty("cookie");
    expect(out).not.toHaveProperty("x-mono-webhook-secret");
  });

  it("lowercases keys for case-insensitive matching", () => {
    const out = sanitizeHeaders({
      "Content-Type": "application/json",
      "X-Request-ID": "req-2",
      AUTHORIZATION: "Bearer xxx",
    });
    expect(out).toEqual({
      "content-type": "application/json",
      "x-request-id": "req-2",
    });
  });

  it("joins array-valued headers with ', '", () => {
    const out = sanitizeHeaders({
      "x-forwarded-for": ["10.0.0.1", "10.0.0.2", "10.0.0.3"],
    });
    expect(out).toEqual({
      "x-forwarded-for": "10.0.0.1, 10.0.0.2, 10.0.0.3",
    });
  });

  it("skips undefined values", () => {
    const out = sanitizeHeaders({
      "content-type": "application/json",
      "x-request-id": undefined,
    });
    expect(out).toEqual({ "content-type": "application/json" });
  });

  it("returns empty object for undefined input", () => {
    expect(sanitizeHeaders(undefined)).toEqual({});
  });

  it("allowlist contains provider-identification headers", () => {
    expect(SAFE_HEADER_ALLOWLIST.has("x-stripe-signature-id")).toBe(true);
    expect(SAFE_HEADER_ALLOWLIST.has("x-mono-request-id")).toBe(true);
    expect(SAFE_HEADER_ALLOWLIST.has("x-railway-deployment-id")).toBe(true);
    expect(SAFE_HEADER_ALLOWLIST.has("x-github-delivery")).toBe(true);
  });

  it("allowlist does NOT contain sensitive headers", () => {
    expect(SAFE_HEADER_ALLOWLIST.has("authorization")).toBe(false);
    expect(SAFE_HEADER_ALLOWLIST.has("cookie")).toBe(false);
    expect(SAFE_HEADER_ALLOWLIST.has("x-mono-webhook-secret")).toBe(false);
    expect(SAFE_HEADER_ALLOWLIST.has("x-api-key")).toBe(false);
  });
});

describe("recordWebhookEvent", () => {
  it("INSERTs with 4 args and coerces bigint id to number", async () => {
    const pool = mockPool([
      { id: "9007199254740991", received_at: new Date() },
    ]);
    const out = await recordWebhookEvent(pool, {
      workflowId: "01-billing-pipeline",
      source: "stripe",
      payload: { type: "subscription.created" },
      headers: { "content-type": "application/json" },
    });
    expect(out.id).toBe(9007199254740991);
    expect(typeof out.id).toBe("number");

    const queryFn = pool.query as ReturnType<typeof vi.fn>;
    const [sql, params] = queryFn.mock.calls[0] ?? [];
    expect(sql).toContain("INSERT INTO n8n_webhook_events");
    expect(sql).toContain("RETURNING id, received_at");
    expect(params).toEqual([
      "01-billing-pipeline",
      "stripe",
      JSON.stringify({ type: "subscription.created" }),
      JSON.stringify({ "content-type": "application/json" }),
    ]);
  });

  it("sanitizes headers before INSERT (drops authorization)", async () => {
    const pool = mockPool([{ id: "1", received_at: new Date() }]);
    await recordWebhookEvent(pool, {
      workflowId: "06-mono-webhook-enrichment",
      source: "mono",
      payload: {},
      headers: {
        authorization: "Bearer secret",
        "x-mono-request-id": "mono-req-1",
      },
    });
    const queryFn = pool.query as ReturnType<typeof vi.fn>;
    const params = queryFn.mock.calls[0]?.[1] as string[];
    const headersStored = JSON.parse(params[3] ?? "{}");
    expect(headersStored).toEqual({ "x-mono-request-id": "mono-req-1" });
    expect(headersStored).not.toHaveProperty("authorization");
  });

  it("throws PayloadTooLargeError when payload exceeds MAX_PAYLOAD_BYTES", async () => {
    const pool = mockPool([]);
    // Build a payload whose JSON-encoded size definitely exceeds the cap.
    const huge = "x".repeat(MAX_PAYLOAD_BYTES + 1);
    await expect(
      recordWebhookEvent(pool, {
        workflowId: "01-billing-pipeline",
        source: "stripe",
        payload: { blob: huge },
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeError);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("throws HeadersTooLargeError when sanitized headers exceed MAX_HEADERS_BYTES", async () => {
    const pool = mockPool([]);
    // x-forwarded-for is in the allowlist; we can blow it up to exceed the cap.
    const huge = "10.0.0.1, ".repeat(Math.ceil(MAX_HEADERS_BYTES / 10) + 1);
    await expect(
      recordWebhookEvent(pool, {
        workflowId: "01-billing-pipeline",
        source: "stripe",
        payload: {},
        headers: { "x-forwarded-for": huge },
      }),
    ).rejects.toBeInstanceOf(HeadersTooLargeError);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("serializes null payload (not undefined) when caller passes nothing", async () => {
    const pool = mockPool([{ id: "1", received_at: new Date() }]);
    await recordWebhookEvent(pool, {
      workflowId: "15-railway-deployment-notify",
      source: "railway",
      payload: undefined,
    });
    const queryFn = pool.query as ReturnType<typeof vi.fn>;
    const params = queryFn.mock.calls[0]?.[1] as string[];
    // JSON.stringify(undefined) === undefined → we want "null" in JSONB.
    expect(params[2]).toBe("null");
  });

  it("throws if INSERT … RETURNING returns no rows (safety net)", async () => {
    const pool = mockPool([]);
    await expect(
      recordWebhookEvent(pool, {
        workflowId: "01-billing-pipeline",
        source: "stripe",
        payload: {},
      }),
    ).rejects.toThrow(/returned no rows/);
  });
});
