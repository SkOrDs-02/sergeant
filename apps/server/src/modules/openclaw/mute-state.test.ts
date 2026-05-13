import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  clearFounderMute,
  getFounderMute,
  isFounderMuted,
  setFounderMute,
} from "./mute-state.js";

/**
 * Unit-tests for `openclaw_mute_state` helpers (PR /mute Phase 5b).
 *
 * Pure SQL-shape checks via fake `pg.Pool`. We assert SQL text-shape,
 * parameter ordering, and DB-row → API-shape coercion so future
 * refactors don't silently drop filters or break the contract.
 *
 * Real INSERT/UPSERT/SELECT roundtrip is exercised by integration
 * migrations + `pnpm ops:migrate:dryrun` — out of unit-test scope.
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

describe("setFounderMute", () => {
  it("issues an UPSERT with ON CONFLICT (founder_user_id)", async () => {
    const mutedUntil = new Date("2026-05-13T22:00:00.000Z");
    const setAt = new Date("2026-05-13T18:00:00.000Z");
    const { pool, calls } = makeFakePool([
      {
        founder_user_id: "user-1",
        muted_until: mutedUntil,
        set_at: setAt,
        reason: "sleep",
      },
    ]);
    const result = await setFounderMute(pool, {
      founderUserId: "user-1",
      mutedUntil,
      reason: "sleep",
    });
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("expected one DB call");
    expect(call.text).toContain("INSERT INTO openclaw_mute_state");
    expect(call.text).toContain("ON CONFLICT (founder_user_id)");
    expect(call.text).toContain("DO UPDATE SET");
    expect(call.values).toEqual(["user-1", mutedUntil, "sleep"]);
    expect(result).toEqual({
      founderUserId: "user-1",
      mutedUntilIso: "2026-05-13T22:00:00.000Z",
      setAtIso: "2026-05-13T18:00:00.000Z",
      reason: "sleep",
    });
  });

  it("accepts mutedUntil=null (an explicit unmute / /mute off path)", async () => {
    const setAt = new Date("2026-05-13T18:00:00.000Z");
    const { pool, calls } = makeFakePool([
      {
        founder_user_id: "user-1",
        muted_until: null,
        set_at: setAt,
        reason: null,
      },
    ]);
    const result = await setFounderMute(pool, {
      founderUserId: "user-1",
      mutedUntil: null,
      reason: null,
    });
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("expected one DB call");
    expect(call.values).toEqual(["user-1", null, null]);
    expect(result.mutedUntilIso).toBe(null);
    expect(result.reason).toBe(null);
  });

  it("throws when upsert returns no row (unexpected DB state)", async () => {
    const { pool } = makeFakePool([]);
    await expect(
      setFounderMute(pool, {
        founderUserId: "user-1",
        mutedUntil: new Date(),
        reason: null,
      }),
    ).rejects.toThrow("setFounderMute");
  });
});

describe("clearFounderMute", () => {
  it("wraps setFounderMute with mutedUntil=null and reason=null", async () => {
    const setAt = new Date("2026-05-13T18:00:00.000Z");
    const { pool, calls } = makeFakePool([
      {
        founder_user_id: "user-1",
        muted_until: null,
        set_at: setAt,
        reason: null,
      },
    ]);
    const result = await clearFounderMute(pool, { founderUserId: "user-1" });
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("expected one DB call");
    expect(call.values).toEqual(["user-1", null, null]);
    expect(result.mutedUntilIso).toBe(null);
    expect(result.reason).toBe(null);
  });
});

describe("getFounderMute", () => {
  it("returns null when no row exists", async () => {
    const { pool, calls } = makeFakePool([]);
    const result = await getFounderMute(pool, { founderUserId: "user-x" });
    expect(result).toBe(null);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("expected one DB call");
    expect(call.text).toContain("SELECT");
    expect(call.text).toContain("FROM openclaw_mute_state");
    expect(call.values).toEqual(["user-x"]);
  });

  it("hydrates rows including muted_until=null (post-clear state)", async () => {
    const setAt = new Date("2026-05-13T18:00:00.000Z");
    const { pool } = makeFakePool([
      {
        founder_user_id: "user-1",
        muted_until: null,
        set_at: setAt,
        reason: null,
      },
    ]);
    const result = await getFounderMute(pool, { founderUserId: "user-1" });
    expect(result).toEqual({
      founderUserId: "user-1",
      mutedUntilIso: null,
      setAtIso: "2026-05-13T18:00:00.000Z",
      reason: null,
    });
  });

  it("hydrates rows with active mute (muted_until in the future)", async () => {
    const mutedUntil = new Date("2026-05-14T06:00:00.000Z");
    const setAt = new Date("2026-05-13T22:00:00.000Z");
    const { pool } = makeFakePool([
      {
        founder_user_id: "user-1",
        muted_until: mutedUntil,
        set_at: setAt,
        reason: "deep-work",
      },
    ]);
    const result = await getFounderMute(pool, { founderUserId: "user-1" });
    expect(result).toEqual({
      founderUserId: "user-1",
      mutedUntilIso: "2026-05-14T06:00:00.000Z",
      setAtIso: "2026-05-13T22:00:00.000Z",
      reason: "deep-work",
    });
  });
});

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
    // SQL has `muted_until IS NOT NULL`, so this should not happen in
    // prod — but the helper still defends against an unexpected fake-pool
    // payload (or future schema relax-ation).
    const { pool } = makeFakePool([{ muted_until: null, reason: null }]);
    const result = await isFounderMuted(pool, { founderUserId: "user-1" });
    expect(result).toEqual({
      muted: false,
      mutedUntilIso: null,
      reason: null,
    });
  });
});
