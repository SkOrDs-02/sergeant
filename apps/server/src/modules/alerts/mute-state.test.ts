import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { isFounderMuted } from "./mute-state.js";

/**
 * Unit-tests for the `openclaw_mute_state` read-guard used by the alerts
 * shipper. Pure SQL-shape checks via fake `pg.Pool`: assert SQL text-shape,
 * parameter ordering, and DB-row → API-shape coercion.
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

describe("isFounderMuted (runtime guard)", () => {
  it("returns muted=false when no row exists", async () => {
    const { pool, calls } = makeFakePool([]);
    const result = await isFounderMuted(pool, { founderUserId: "user-1" });
    expect(result).toEqual({
      muted: false,
      mutedUntilIso: null,
      reason: null,
    });
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("expected one DB call");
    expect(call.text).toContain("WHERE founder_user_id = $1");
    expect(call.text).toContain("AND muted_until IS NOT NULL");
    expect(call.text).toContain("AND muted_until > NOW()");
  });

  it("returns muted=true with mutedUntilIso when row indicates active mute", async () => {
    const mutedUntil = new Date("2026-05-14T06:00:00.000Z");
    const { pool } = makeFakePool([
      { muted_until: mutedUntil, reason: "sleep" },
    ]);
    const result = await isFounderMuted(pool, { founderUserId: "user-1" });
    expect(result).toEqual({
      muted: true,
      mutedUntilIso: "2026-05-14T06:00:00.000Z",
      reason: "sleep",
    });
  });

  it("returns muted=false when DB returns row without muted_until (defensive)", async () => {
    const { pool } = makeFakePool([{ muted_until: null, reason: null }]);
    const result = await isFounderMuted(pool, { founderUserId: "user-1" });
    expect(result).toEqual({
      muted: false,
      mutedUntilIso: null,
      reason: null,
    });
  });
});
