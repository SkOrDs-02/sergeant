import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { finalizeInvocation, openInvocation } from "./invocation-audit.js";

/**
 * Unit-tests for the `openclaw_invocations` audit helpers used by
 * `ai-memory` `/forget`. Pure SQL-shape checks via fake `pg.Pool`.
 */

interface RecordedCall {
  text: string;
  values: unknown[];
}

function makeFakePool(rows: Record<string, unknown>[] = []): {
  pool: Pool;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const pool = {
    async query(text: string, values: unknown[]) {
      calls.push({ text, values });
      return { rows, rowCount: rows.length };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as Pool;
  return { pool, calls };
}

describe("openInvocation", () => {
  it("INSERTs and coerces the BIGINT id to number", async () => {
    const { pool, calls } = makeFakePool([{ id: "42" }]);
    const id = await openInvocation(pool, {
      founderUserId: "user-1",
      founderTgUserId: 777,
      trigger: "dm",
      userMessage: "/forget byTopic groceries",
      metadata: { kind: "ai-memory-forget" },
    });
    expect(id).toBe(42);
    const call = calls[0];
    if (!call) throw new Error("expected one DB call");
    expect(call.text).toContain("INSERT INTO openclaw_invocations");
    expect(call.values[0]).toBe("user-1");
    expect(call.values[2]).toBe("dm");
  });

  it("throws when INSERT RETURNING returns no rows", async () => {
    const { pool } = makeFakePool([]);
    await expect(
      openInvocation(pool, {
        founderUserId: "user-1",
        founderTgUserId: 777,
        trigger: "dm",
        userMessage: "x",
      }),
    ).rejects.toThrow("openInvocation");
  });
});

describe("finalizeInvocation", () => {
  it("UPDATEs the row by id with the finalized status", async () => {
    const { pool, calls } = makeFakePool([]);
    await finalizeInvocation(pool, {
      invocationId: 42,
      status: "success",
      assistantResponse: "Deleted 3 row(s).",
      toolCalls: [],
      toneMode: null,
      metadataPatch: { deleted_count: 3 },
    });
    const call = calls[0];
    if (!call) throw new Error("expected one DB call");
    expect(call.text).toContain("UPDATE openclaw_invocations");
    expect(call.text).toContain("WHERE id = $1");
    expect(call.values[0]).toBe(42);
    expect(call.values[1]).toBe("success");
  });
});
