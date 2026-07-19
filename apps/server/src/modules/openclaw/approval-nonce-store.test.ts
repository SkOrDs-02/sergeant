import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  consumeApprovalNonce,
  issueApprovalNonce,
  purgeExpiredApprovalNonces,
  type IssueApprovalNonceInput,
} from "./approval-nonce-store.js";

/**
 * Unit-tests for the `openclaw_approval_nonce` DB ledger (single-use
 * enforcement, see approval-nonce-store.ts header comment).
 *
 * Pure SQL-shape checks via fake `pg.Pool`, mirroring the pattern in
 * `store.test.ts`: assert query text-shape + bound params + result
 * mapping, not real Postgres round-trips (out of unit-test scope).
 */

interface RecordedCall {
  text: string;
  values: unknown[];
}

function makeFakePool(
  rows: Record<string, unknown>[] = [],
  rowCount: number | null = rows.length,
): {
  pool: Pool;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const pool = {
    async query(text: string, values: unknown[]) {
      calls.push({ text, values });
      return { rows, rowCount };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as Pool;
  return { pool, calls };
}

function baseIssueInput(): IssueApprovalNonceInput {
  return {
    jti: "nonce-abc123",
    tool: "pause_workflow",
    argsHash: "deadbeef",
    expiresAt: new Date("2026-05-01T00:05:00.000Z"),
  };
}

describe("issueApprovalNonce", () => {
  it("INSERTs into openclaw_approval_nonce with positional params", async () => {
    const { pool, calls } = makeFakePool([]);
    await issueApprovalNonce(pool, baseIssueInput());
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toMatch(/INSERT INTO openclaw_approval_nonce/);
    expect(calls[0]?.values).toEqual([
      "nonce-abc123",
      "pause_workflow",
      "deadbeef",
      new Date("2026-05-01T00:05:00.000Z"),
    ]);
  });

  it("resolves without a return value", async () => {
    const { pool } = makeFakePool([]);
    await expect(
      issueApprovalNonce(pool, baseIssueInput()),
    ).resolves.toBeUndefined();
  });
});

describe("consumeApprovalNonce", () => {
  it("returns ok:true with tool+argsHash when a row is atomically consumed", async () => {
    const { pool, calls } = makeFakePool([
      { tool: "pause_workflow", args_hash: "deadbeef" },
    ]);
    const result = await consumeApprovalNonce(pool, "nonce-abc123");
    expect(result).toEqual({
      ok: true,
      tool: "pause_workflow",
      argsHash: "deadbeef",
    });
    expect(calls[0]?.text).toMatch(/UPDATE openclaw_approval_nonce/);
    expect(calls[0]?.text).toMatch(/SET\s+consumed_at = NOW\(\)/);
    expect(calls[0]?.text).toMatch(/consumed_at IS NULL/);
    expect(calls[0]?.text).toMatch(/expires_at > NOW\(\)/);
    expect(calls[0]?.values).toEqual(["nonce-abc123"]);
  });

  it("returns ok:false already_consumed_or_unknown when no row matches (spent/expired/unknown)", async () => {
    const { pool } = makeFakePool([]);
    const result = await consumeApprovalNonce(pool, "nonce-spent");
    expect(result).toEqual({
      ok: false,
      reason: "already_consumed_or_unknown",
    });
  });
});

describe("purgeExpiredApprovalNonces", () => {
  it("DELETEs expired rows and returns the removed row count", async () => {
    const { pool, calls } = makeFakePool([], 7);
    const removed = await purgeExpiredApprovalNonces(pool);
    expect(removed).toBe(7);
    expect(calls[0]?.text).toMatch(
      /DELETE FROM openclaw_approval_nonce WHERE expires_at <= NOW\(\)/,
    );
  });

  it("defaults to 0 when rowCount is null", async () => {
    const { pool } = makeFakePool([], null);
    const removed = await purgeExpiredApprovalNonces(pool);
    expect(removed).toBe(0);
  });
});
