import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import type { SyncV2Op } from "../../../http/schemas.js";
import { applyFizrukExercisePrefs } from "./applyExercisePrefs.js";

/**
 * Памʼять типу виміру вправи (`fizruk_exercise_prefs`, міграція 173, спека
 * `docs/work/specs/fizruk-exercise-measure-type.md`, зріз 5).
 */

const USER_ID = "user-prefs";
const CLIENT_TS = new Date("2026-11-18T12:00:00.000Z");
const OLDER = [
  {
    user_id: USER_ID,
    updated_at: new Date("2026-11-01T00:00:00.000Z"),
    deleted_at: null,
  },
];

function makeClient(existing: Record<string, unknown>[] = []) {
  const query = vi.fn();
  query.mockResolvedValueOnce({ rows: existing });
  query.mockResolvedValue({ rows: [], rowCount: 1 });
  return { query } as unknown as PoolClient & { query: typeof query };
}

function op(
  row: Record<string, unknown>,
  kind: SyncV2Op["op"] = "insert",
): SyncV2Op {
  return {
    table: "fizruk_exercise_prefs",
    op: kind,
    row: { user_id: USER_ID, ...row },
    client_ts: CLIENT_TS.toISOString(),
    idempotency_key: "k-prefs",
  } as unknown as SyncV2Op;
}

describe("fizruk_exercise_prefs: памʼять типу вправи", () => {
  it.each([
    ["без id", { measure: "time" }, "missing_id"],
    [
      "тип у верхньому регістрі",
      { id: "plank", measure: "WEIGHT" },
      "invalid_measure",
    ],
    ["незнайомий тип", { id: "plank", measure: "rounds" }, "invalid_measure"],
    ["тип відсутній", { id: "plank" }, "invalid_measure"],
  ])("відхиляє до запису: %s", async (_label, row, reason) => {
    const client = makeClient();
    const result = await applyFizrukExercisePrefs(
      client,
      op(row),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason });
    expect(client.query.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("upsert пише тип і скидає deleted_at (повторний вибір воскрешає)", async () => {
    const client = makeClient(OLDER);
    const result = await applyFizrukExercisePrefs(
      client,
      op({ id: "plank", measure: "reps" }, "update"),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    const [sql, params] = client.query.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO fizruk_exercise_prefs/);
    expect(sql).toMatch(/deleted_at = NULL/);
    expect(sql).toMatch(
      /fizruk_exercise_prefs\.updated_at < EXCLUDED\.updated_at/,
    );
    expect(params).toEqual(["plank", USER_ID, "reps", CLIENT_TS]);
  });

  it("новіший рядок на сервері — lww_conflict без запису", async () => {
    const client = makeClient([
      { ...OLDER[0], updated_at: new Date("2026-11-19T00:00:00.000Z") },
    ]);
    const result = await applyFizrukExercisePrefs(
      client,
      op({ id: "plank", measure: "reps" }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "lww_conflict" });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("delete = soft-delete («повернути дефолт каталогу»)", async () => {
    const client = makeClient(OLDER);
    const result = await applyFizrukExercisePrefs(
      client,
      op({ id: "plank" }, "delete"),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    const [sql] = client.query.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/SET deleted_at = \$1, updated_at = \$1/);
  });

  it("чужий user_id у рядку відхиляється", async () => {
    const client = makeClient();
    const result = await applyFizrukExercisePrefs(
      client,
      op({ id: "plank", measure: "time", user_id: "someone-else" }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result.status).toBe("rejected");
    expect(client.query).not.toHaveBeenCalled();
  });
});
