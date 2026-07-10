import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../http/schemas.js";
import { applyRoutineHabits } from "./routine/applySyncFullState.js";
import { applyNutritionWaterLog } from "./nutrition/applySyncFullState.js";
import { applyFizrukPrograms } from "./fizruk/applySyncFullState.js";
import { SYNC_V2_SUPPORTED_TABLES } from "./syncV2.js";

const USER_ID = "user-phase2";
const CLIENT_TS = new Date("2026-07-10T12:00:00.000Z");

function makeClient(
  ...rowSets: Array<Array<Record<string, unknown>>>
): PoolClient & { query: Mock } {
  const query = vi.fn();
  for (const rows of rowSets) {
    query.mockResolvedValueOnce({ rows });
  }
  query.mockResolvedValue({ rows: [] });
  return { query } as unknown as PoolClient & { query: Mock };
}

function op(
  table: string,
  row: Record<string, unknown>,
  kind: "insert" | "update" | "delete" = "insert",
): SyncV2Op {
  return {
    table,
    op: kind,
    row,
    client_ts: CLIENT_TS.toISOString(),
    idempotency_key: `k-${table}-${kind}`,
  } as unknown as SyncV2Op;
}

describe("Phase 2 registry expansion", () => {
  it("SYNC_V2_SUPPORTED_TABLES includes 15 Phase 2 tables (42 total)", () => {
    expect(SYNC_V2_SUPPORTED_TABLES).toHaveLength(42);
    expect(SYNC_V2_SUPPORTED_TABLES).toEqual(
      expect.arrayContaining([
        "routine_habits",
        "nutrition_water_log",
        "fizruk_daily_log",
        "fizruk_programs",
      ]),
    );
  });

  it("applyRoutineHabits inserts new habit with sqlite-style json columns", async () => {
    const client = makeClient([]);
    const result = await applyRoutineHabits(
      client,
      op("routine_habits", {
        id: "habit-1",
        user_id: USER_ID,
        name: "Run",
        tag_ids_json: "[]",
        reminder_times_json: "[]",
        weekdays_json: "[0,1,2,3,4,5,6]",
        archived: 0,
        paused: 0,
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("applyNutritionWaterLog upserts water row", async () => {
    const client = makeClient([]);
    const result = await applyNutritionWaterLog(
      client,
      op("nutrition_water_log", {
        user_id: USER_ID,
        date_key: "2026-07-10",
        volume_ml: 500,
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
  });

  it("applyFizrukPrograms upserts active program id", async () => {
    const client = makeClient([]);
    const result = await applyFizrukPrograms(
      client,
      op("fizruk_programs", {
        user_id: USER_ID,
        active_program_id: "prog-1",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
  });
});
