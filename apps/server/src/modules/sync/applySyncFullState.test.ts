import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../http/schemas.js";
import {
  applyRoutineHabits,
  applyUuidNameScopeTable,
  applyRoutinePrefs,
  applyRoutinePushups,
  applyRoutineHabitOrder,
  applyRoutineCompletionNotes,
} from "./routine/applySyncFullState.js";
import {
  applyNutritionWaterLog,
  applyNutritionShoppingList,
} from "./nutrition/applySyncFullState.js";
import {
  applyFizrukPrograms,
  applyFizrukDailyLog,
  applyFizrukMonthlyPlan,
  applyFizrukPlanTemplates,
  applyFizrukWellbeing,
  applyFizrukWorkoutTemplates,
} from "./fizruk/applySyncFullState.js";
import { SYNC_V2_SUPPORTED_TABLES } from "./syncV2.js";

const USER_ID = "user-phase2";
const CLIENT_TS = new Date("2026-07-10T12:00:00.000Z");

// The sync registry (syncV2.ts) binds these two tables to the shared
// UUID+name+scope apply fn curried by table name. Test-local bindings keep the
// assertions below readable without production delegating wrappers.
const applyRoutineTags = (c: PoolClient, o: SyncV2Op, u: string, t: Date) =>
  applyUuidNameScopeTable(c, "routine_tags", o, u, t);
const applyRoutineCategories = (
  c: PoolClient,
  o: SyncV2Op,
  u: string,
  t: Date,
) => applyUuidNameScopeTable(c, "routine_categories", o, u, t);

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

  it("applyFizrukPrograms rejects delete ops", async () => {
    const client = makeClient([]);
    const result = await applyFizrukPrograms(
      client,
      op("fizruk_programs", { user_id: USER_ID }, "delete"),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({
      status: "rejected",
      reason: "delete_not_supported",
    });
  });
});

describe("routine full-state appliers", () => {
  it("applyRoutineTags inserts a new tag", async () => {
    const client = makeClient([]);
    const result = await applyRoutineTags(
      client,
      op("routine_tags", {
        id: "tag-1",
        user_id: USER_ID,
        name: "Health",
        scope: "habit",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO routine_tags"),
      expect.arrayContaining(["tag-1", USER_ID, "Health", "habit"]),
    );
  });

  it("applyRoutineTags updates an existing tag", async () => {
    const client = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-07-01T00:00:00.000Z"),
        deleted_at: null,
      },
    ]);
    const result = await applyRoutineTags(
      client,
      op("routine_tags", {
        id: "tag-1",
        user_id: USER_ID,
        name: "Renamed",
        scope: "habit",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE routine_tags"),
      expect.arrayContaining(["Renamed", "habit"]),
    );
  });

  it("applyRoutineTags soft-deletes via a delete op", async () => {
    const client = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-07-01T00:00:00.000Z"),
        deleted_at: null,
      },
    ]);
    const result = await applyRoutineTags(
      client,
      op("routine_tags", { id: "tag-1", user_id: USER_ID }, "delete"),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE routine_tags"),
      [CLIENT_TS, "tag-1", USER_ID],
    );
  });

  it("applyRoutineTags rejects when name is missing", async () => {
    const client = makeClient([]);
    const result = await applyRoutineTags(
      client,
      op("routine_tags", { id: "tag-1", user_id: USER_ID }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "missing_name" });
  });

  it("applyRoutineTags rejects when id is missing", async () => {
    const client = makeClient([]);
    const result = await applyRoutineTags(
      client,
      op("routine_tags", { user_id: USER_ID, name: "x" }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "missing_id" });
  });

  it("applyRoutineCategories inserts a new category with emoji", async () => {
    const client = makeClient([]);
    const result = await applyRoutineCategories(
      client,
      op("routine_categories", {
        id: "cat-1",
        user_id: USER_ID,
        name: "Fitness",
        emoji: "\u{1F3CB}",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO routine_categories"),
      expect.arrayContaining(["cat-1", USER_ID, "Fitness", "\u{1F3CB}"]),
    );
  });

  it("applyRoutinePrefs rejects delete ops", async () => {
    const client = makeClient([]);
    const result = await applyRoutinePrefs(
      client,
      op("routine_prefs", { user_id: USER_ID }, "delete"),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({
      status: "rejected",
      reason: "delete_not_supported",
    });
  });

  it("applyRoutinePrefs upserts prefs data", async () => {
    const client = makeClient([]);
    const result = await applyRoutinePrefs(
      client,
      op("routine_prefs", { user_id: USER_ID, data: { theme: "dark" } }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO routine_prefs"),
      [USER_ID, JSON.stringify({ theme: "dark" }), CLIENT_TS],
    );
  });

  it("applyRoutinePrefs rejects on lww_conflict", async () => {
    const client = makeClient([
      { user_id: USER_ID, updated_at: new Date("2026-07-10T13:00:00.000Z") },
    ]);
    const result = await applyRoutinePrefs(
      client,
      op("routine_prefs", { user_id: USER_ID, data: {} }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  it("applyRoutinePushups rejects when date_key is missing", async () => {
    const client = makeClient([]);
    const result = await applyRoutinePushups(
      client,
      op("routine_pushups", { user_id: USER_ID, reps: 20 }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({
      status: "rejected",
      reason: "missing_date_key",
    });
  });

  it("applyRoutinePushups upserts reps for a date", async () => {
    const client = makeClient([]);
    const result = await applyRoutinePushups(
      client,
      op("routine_pushups", {
        user_id: USER_ID,
        date_key: "2026-07-10",
        reps: 45,
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO routine_pushups"),
      [USER_ID, "2026-07-10", 45, CLIENT_TS],
    );
  });

  it("applyRoutineHabitOrder upserts the ordering array", async () => {
    const client = makeClient([]);
    const result = await applyRoutineHabitOrder(
      client,
      op("routine_habit_order", { user_id: USER_ID, order: ["a", "b"] }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO routine_habit_order"),
      [USER_ID, JSON.stringify(["a", "b"]), CLIENT_TS],
    );
  });

  it("applyRoutineCompletionNotes rejects when note_key is missing", async () => {
    const client = makeClient([]);
    const result = await applyRoutineCompletionNotes(
      client,
      op("routine_completion_notes", { user_id: USER_ID }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({
      status: "rejected",
      reason: "missing_note_key",
    });
  });

  it("applyRoutineCompletionNotes inserts a new note", async () => {
    const client = makeClient([]);
    const result = await applyRoutineCompletionNotes(
      client,
      op("routine_completion_notes", {
        user_id: USER_ID,
        note_key: "2026-07-10:habit-1",
        note: "felt great",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
  });

  it("applyRoutineCompletionNotes rejects fk_violation for another user's row", async () => {
    const client = makeClient([
      {
        user_id: "other-user",
        updated_at: new Date("2026-07-01T00:00:00.000Z"),
        deleted_at: null,
      },
    ]);
    const result = await applyRoutineCompletionNotes(
      client,
      op("routine_completion_notes", {
        user_id: USER_ID,
        note_key: "k",
        note: "x",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "fk_violation" });
  });

  it("applyRoutineCompletionNotes rejects tombstoned rows on non-delete ops", async () => {
    const client = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-07-01T00:00:00.000Z"),
        deleted_at: new Date("2026-06-01T00:00:00.000Z"),
      },
    ]);
    const result = await applyRoutineCompletionNotes(
      client,
      op("routine_completion_notes", {
        user_id: USER_ID,
        note_key: "k",
        note: "x",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "tombstoned" });
  });

  it("applyRoutineCompletionNotes soft-deletes an existing note", async () => {
    const client = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-07-01T00:00:00.000Z"),
        deleted_at: null,
      },
    ]);
    const result = await applyRoutineCompletionNotes(
      client,
      op(
        "routine_completion_notes",
        { user_id: USER_ID, note_key: "k" },
        "delete",
      ),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE routine_completion_notes"),
      [CLIENT_TS, USER_ID, "k"],
    );
  });

  it("applyRoutineCompletionNotes rejects deleting a note that does not exist", async () => {
    const client = makeClient([]);
    const result = await applyRoutineCompletionNotes(
      client,
      op(
        "routine_completion_notes",
        { user_id: USER_ID, note_key: "k" },
        "delete",
      ),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "not_found" });
  });
});

describe("nutrition full-state appliers", () => {
  it("applyNutritionWaterLog rejects delete ops", async () => {
    const client = makeClient([]);
    const result = await applyNutritionWaterLog(
      client,
      op("nutrition_water_log", { user_id: USER_ID }, "delete"),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({
      status: "rejected",
      reason: "delete_not_supported",
    });
  });

  it("applyNutritionShoppingList upserts list data", async () => {
    const client = makeClient([]);
    const result = await applyNutritionShoppingList(
      client,
      op("nutrition_shopping_list", {
        user_id: USER_ID,
        data: { items: ["milk"] },
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO nutrition_shopping_list"),
      [USER_ID, JSON.stringify({ items: ["milk"] }), CLIENT_TS],
    );
  });

  it("applyNutritionShoppingList rejects delete ops", async () => {
    const client = makeClient([]);
    const result = await applyNutritionShoppingList(
      client,
      op("nutrition_shopping_list", { user_id: USER_ID }, "delete"),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({
      status: "rejected",
      reason: "delete_not_supported",
    });
  });

  it("applyNutritionShoppingList rejects on lww_conflict", async () => {
    const client = makeClient([
      { user_id: USER_ID, updated_at: new Date("2026-07-10T13:00:00.000Z") },
    ]);
    const result = await applyNutritionShoppingList(
      client,
      op("nutrition_shopping_list", { user_id: USER_ID, data: {} }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "lww_conflict" });
  });
});

describe("fizruk full-state appliers", () => {
  it("applyFizrukDailyLog rejects when id is missing", async () => {
    const client = makeClient([]);
    const result = await applyFizrukDailyLog(
      client,
      op("fizruk_daily_log", { user_id: USER_ID }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "missing_id" });
  });

  it("applyFizrukDailyLog inserts a new entry", async () => {
    const client = makeClient([]);
    const result = await applyFizrukDailyLog(
      client,
      op("fizruk_daily_log", {
        id: "log-1",
        user_id: USER_ID,
        entry_at: "2026-07-10T08:00:00.000Z",
        weight_kg: 80.5,
        sleep_hours: 7.5,
        energy_level: 4,
        mood: 3,
        note: "good day",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO fizruk_daily_log"),
      expect.arrayContaining(["log-1", USER_ID]),
    );
  });

  it("applyFizrukDailyLog rejects an invalid entry_at", async () => {
    const client = makeClient([]);
    const result = await applyFizrukDailyLog(
      client,
      op("fizruk_daily_log", {
        id: "log-1",
        user_id: USER_ID,
        entry_at: "not-a-date",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({
      status: "rejected",
      reason: "invalid_entry_at",
    });
  });

  it("applyFizrukDailyLog updates an existing entry", async () => {
    const client = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-07-01T00:00:00.000Z"),
        deleted_at: null,
      },
    ]);
    const result = await applyFizrukDailyLog(
      client,
      op("fizruk_daily_log", {
        id: "log-1",
        user_id: USER_ID,
        entry_at: "2026-07-10T08:00:00.000Z",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE fizruk_daily_log"),
      expect.any(Array),
    );
  });

  it("applyFizrukDailyLog soft-deletes an existing entry", async () => {
    const client = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-07-01T00:00:00.000Z"),
        deleted_at: null,
      },
    ]);
    const result = await applyFizrukDailyLog(
      client,
      op("fizruk_daily_log", { id: "log-1", user_id: USER_ID }, "delete"),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE fizruk_daily_log"),
      [CLIENT_TS, "log-1", USER_ID],
    );
  });

  it("applyFizrukMonthlyPlan rejects delete ops", async () => {
    const client = makeClient([]);
    const result = await applyFizrukMonthlyPlan(
      client,
      op("fizruk_monthly_plan", { user_id: USER_ID }, "delete"),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({
      status: "rejected",
      reason: "delete_not_supported",
    });
  });

  it("applyFizrukMonthlyPlan upserts plan data", async () => {
    const client = makeClient([]);
    const result = await applyFizrukMonthlyPlan(
      client,
      op("fizruk_monthly_plan", {
        user_id: USER_ID,
        data: { days: [] },
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
  });

  it("applyFizrukPlanTemplates upserts template data", async () => {
    const client = makeClient([]);
    const result = await applyFizrukPlanTemplates(
      client,
      op("fizruk_plan_templates", {
        user_id: USER_ID,
        data: { templates: [] },
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
  });

  it("applyFizrukPlanTemplates treats a literal 'null' payload as null", async () => {
    const client = makeClient([]);
    const result = await applyFizrukPlanTemplates(
      client,
      op("fizruk_plan_templates", { user_id: USER_ID, data: null }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO fizruk_plan_templates"),
      [USER_ID, null, CLIENT_TS],
    );
  });

  it("applyFizrukWellbeing rejects when date_key is missing", async () => {
    const client = makeClient([]);
    const result = await applyFizrukWellbeing(
      client,
      op("fizruk_wellbeing", { user_id: USER_ID }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({
      status: "rejected",
      reason: "missing_date_key",
    });
  });

  it("applyFizrukWellbeing inserts a new entry", async () => {
    const client = makeClient([]);
    const result = await applyFizrukWellbeing(
      client,
      op("fizruk_wellbeing", {
        user_id: USER_ID,
        date_key: "2026-07-10",
        mood: 4,
        energy: 3,
        sleep_quality: 5,
        sleep_hours: 8,
        notes: "rested",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO fizruk_wellbeing"),
      expect.any(Array),
    );
  });

  it("applyFizrukWellbeing rejects an invalid mood", async () => {
    const client = makeClient([]);
    const result = await applyFizrukWellbeing(
      client,
      op("fizruk_wellbeing", {
        user_id: USER_ID,
        date_key: "2026-07-10",
        mood: "high",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "invalid_mood" });
  });

  it("applyFizrukWellbeing soft-deletes an existing entry", async () => {
    const client = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-07-01T00:00:00.000Z"),
        deleted_at: null,
      },
    ]);
    const result = await applyFizrukWellbeing(
      client,
      op(
        "fizruk_wellbeing",
        { user_id: USER_ID, date_key: "2026-07-10" },
        "delete",
      ),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE fizruk_wellbeing"),
      [CLIENT_TS, USER_ID, "2026-07-10"],
    );
  });

  it("applyFizrukWellbeing rejects deleting an entry that does not exist", async () => {
    const client = makeClient([]);
    const result = await applyFizrukWellbeing(
      client,
      op(
        "fizruk_wellbeing",
        { user_id: USER_ID, date_key: "2026-07-10" },
        "delete",
      ),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "not_found" });
  });

  it("applyFizrukWorkoutTemplates rejects when id is missing", async () => {
    const client = makeClient([]);
    const result = await applyFizrukWorkoutTemplates(
      client,
      op("fizruk_workout_templates", { user_id: USER_ID, name: "Push day" }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "missing_id" });
  });

  it("applyFizrukWorkoutTemplates rejects when name is missing", async () => {
    const client = makeClient([]);
    const result = await applyFizrukWorkoutTemplates(
      client,
      op("fizruk_workout_templates", { id: "tpl-1", user_id: USER_ID }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "missing_name" });
  });

  it("applyFizrukWorkoutTemplates inserts a new template", async () => {
    const client = makeClient([]);
    const result = await applyFizrukWorkoutTemplates(
      client,
      op("fizruk_workout_templates", {
        id: "tpl-1",
        user_id: USER_ID,
        name: "Push day",
        exercise_ids: ["ex-1", "ex-2"],
        groups: ["chest"],
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO fizruk_workout_templates"),
      expect.arrayContaining(["tpl-1", USER_ID, "Push day"]),
    );
  });

  it("applyFizrukWorkoutTemplates updates an existing template", async () => {
    const client = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-07-01T00:00:00.000Z"),
        deleted_at: null,
      },
    ]);
    const result = await applyFizrukWorkoutTemplates(
      client,
      op("fizruk_workout_templates", {
        id: "tpl-1",
        user_id: USER_ID,
        name: "Pull day",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE fizruk_workout_templates"),
      expect.any(Array),
    );
  });

  it("applyFizrukWorkoutTemplates soft-deletes an existing template", async () => {
    const client = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-07-01T00:00:00.000Z"),
        deleted_at: null,
      },
    ]);
    const result = await applyFizrukWorkoutTemplates(
      client,
      op(
        "fizruk_workout_templates",
        { id: "tpl-1", user_id: USER_ID },
        "delete",
      ),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE fizruk_workout_templates"),
      [CLIENT_TS, "tpl-1", USER_ID],
    );
  });
});

describe("applyRoutineHabits edge cases", () => {
  it("rejects when id is missing", async () => {
    const client = makeClient([]);
    const result = await applyRoutineHabits(
      client,
      op("routine_habits", { user_id: USER_ID, name: "Run" }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "missing_id" });
  });

  it("rejects on user_id mismatch", async () => {
    const client = makeClient([]);
    const result = await applyRoutineHabits(
      client,
      op("routine_habits", {
        id: "habit-1",
        user_id: "someone-else",
        name: "Run",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "user_id_mismatch" });
  });

  it("rejects on lww_conflict when the existing row is newer", async () => {
    const client = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-07-10T13:00:00.000Z"),
        deleted_at: null,
      },
    ]);
    const result = await applyRoutineHabits(
      client,
      op("routine_habits", {
        id: "habit-1",
        user_id: USER_ID,
        name: "Run",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  it("rejects when name is missing", async () => {
    const client = makeClient([]);
    const result = await applyRoutineHabits(
      client,
      op("routine_habits", { id: "habit-1", user_id: USER_ID }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "missing_name" });
  });

  it("rejects an invalid created_at", async () => {
    const client = makeClient([]);
    const result = await applyRoutineHabits(
      client,
      op("routine_habits", {
        id: "habit-1",
        user_id: USER_ID,
        name: "Run",
        created_at: "bad-date",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({
      status: "rejected",
      reason: "invalid_created_at",
    });
  });

  it("rejects an invalid deleted_at", async () => {
    const client = makeClient([]);
    const result = await applyRoutineHabits(
      client,
      op("routine_habits", {
        id: "habit-1",
        user_id: USER_ID,
        name: "Run",
        deleted_at: "bad-date",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({
      status: "rejected",
      reason: "invalid_deleted_at",
    });
  });

  it("updates an existing habit", async () => {
    const client = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-07-01T00:00:00.000Z"),
        deleted_at: null,
      },
    ]);
    const result = await applyRoutineHabits(
      client,
      op("routine_habits", {
        id: "habit-1",
        user_id: USER_ID,
        name: "Run faster",
        archived: 1,
        paused: 0,
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE routine_habits"),
      expect.any(Array),
    );
  });

  it("soft-deletes an existing habit", async () => {
    const client = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-07-01T00:00:00.000Z"),
        deleted_at: null,
      },
    ]);
    const result = await applyRoutineHabits(
      client,
      op("routine_habits", { id: "habit-1", user_id: USER_ID }, "delete"),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "applied" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE routine_habits"),
      [CLIENT_TS, "habit-1", USER_ID],
    );
  });
});

describe("nutrition full-state validation edge cases", () => {
  it("applyNutritionWaterLog rejects on user_id mismatch", async () => {
    const client = makeClient([]);
    const result = await applyNutritionWaterLog(
      client,
      op("nutrition_water_log", {
        user_id: "someone-else",
        date_key: "2026-07-10",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "user_id_mismatch" });
  });

  it("applyNutritionWaterLog rejects when date_key is missing", async () => {
    const client = makeClient([]);
    const result = await applyNutritionWaterLog(
      client,
      op("nutrition_water_log", { user_id: USER_ID }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({
      status: "rejected",
      reason: "missing_date_key",
    });
  });

  it("applyNutritionWaterLog rejects on lww_conflict", async () => {
    const client = makeClient([
      { user_id: USER_ID, updated_at: new Date("2026-07-10T13:00:00.000Z") },
    ]);
    const result = await applyNutritionWaterLog(
      client,
      op("nutrition_water_log", {
        user_id: USER_ID,
        date_key: "2026-07-10",
        volume_ml: 250,
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  it("applyNutritionShoppingList rejects on user_id mismatch", async () => {
    const client = makeClient([]);
    const result = await applyNutritionShoppingList(
      client,
      op("nutrition_shopping_list", { user_id: "someone-else" }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "user_id_mismatch" });
  });
});

describe("fizruk full-state validation edge cases", () => {
  it("applyFizrukDailyLog rejects on user_id mismatch", async () => {
    const client = makeClient([]);
    const result = await applyFizrukDailyLog(
      client,
      op("fizruk_daily_log", { id: "log-1", user_id: "someone-else" }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "user_id_mismatch" });
  });

  it("applyFizrukDailyLog rejects on lww_conflict", async () => {
    const client = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-07-10T13:00:00.000Z"),
        deleted_at: null,
      },
    ]);
    const result = await applyFizrukDailyLog(
      client,
      op("fizruk_daily_log", {
        id: "log-1",
        user_id: USER_ID,
        entry_at: "2026-07-10T08:00:00.000Z",
      }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  it("applyFizrukDailyLog rejects invalid created_at / deleted_at / weight_kg / sleep_hours / energy_level / mood", async () => {
    const base = {
      id: "log-1",
      user_id: USER_ID,
      entry_at: "2026-07-10T08:00:00.000Z",
    };
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...base, created_at: "bad" }, "invalid_created_at"],
      [{ ...base, deleted_at: "bad" }, "invalid_deleted_at"],
      [{ ...base, weight_kg: "heavy" }, "invalid_weight_kg"],
      [{ ...base, sleep_hours: "lots" }, "invalid_sleep_hours"],
      [{ ...base, energy_level: "high" }, "invalid_energy_level"],
      [{ ...base, mood: "great" }, "invalid_mood"],
    ];
    for (const [row, reason] of cases) {
      const client = makeClient([]);
      const result = await applyFizrukDailyLog(
        client,
        op("fizruk_daily_log", row),
        USER_ID,
        CLIENT_TS,
      );
      expect(result).toEqual({ status: "rejected", reason });
    }
  });

  it("applyFizrukMonthlyPlan rejects on user_id mismatch and lww_conflict", async () => {
    const mismatchClient = makeClient([]);
    expect(
      await applyFizrukMonthlyPlan(
        mismatchClient,
        op("fizruk_monthly_plan", { user_id: "someone-else" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "user_id_mismatch" });

    const conflictClient = makeClient([
      { user_id: USER_ID, updated_at: new Date("2026-07-10T13:00:00.000Z") },
    ]);
    expect(
      await applyFizrukMonthlyPlan(
        conflictClient,
        op("fizruk_monthly_plan", { user_id: USER_ID, data: {} }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  it("applyFizrukPlanTemplates rejects delete ops, user_id mismatch and lww_conflict", async () => {
    const deleteClient = makeClient([]);
    expect(
      await applyFizrukPlanTemplates(
        deleteClient,
        op("fizruk_plan_templates", { user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "delete_not_supported" });

    const mismatchClient = makeClient([]);
    expect(
      await applyFizrukPlanTemplates(
        mismatchClient,
        op("fizruk_plan_templates", { user_id: "someone-else" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "user_id_mismatch" });

    const conflictClient = makeClient([
      { user_id: USER_ID, updated_at: new Date("2026-07-10T13:00:00.000Z") },
    ]);
    expect(
      await applyFizrukPlanTemplates(
        conflictClient,
        op("fizruk_plan_templates", { user_id: USER_ID, data: {} }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  it("applyFizrukPrograms rejects user_id mismatch and lww_conflict", async () => {
    const mismatchClient = makeClient([]);
    expect(
      await applyFizrukPrograms(
        mismatchClient,
        op("fizruk_programs", { user_id: "someone-else" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "user_id_mismatch" });

    const conflictClient = makeClient([
      { user_id: USER_ID, updated_at: new Date("2026-07-10T13:00:00.000Z") },
    ]);
    expect(
      await applyFizrukPrograms(
        conflictClient,
        op("fizruk_programs", {
          user_id: USER_ID,
          active_program_id: "prog-2",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  it("applyFizrukWellbeing rejects fk_violation, lww_conflict and tombstoned", async () => {
    const fkClient = makeClient([
      {
        user_id: "other-user",
        updated_at: new Date("2026-07-01T00:00:00.000Z"),
        deleted_at: null,
      },
    ]);
    expect(
      await applyFizrukWellbeing(
        fkClient,
        op("fizruk_wellbeing", { user_id: USER_ID, date_key: "2026-07-10" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "fk_violation" });

    const conflictClient = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-07-10T13:00:00.000Z"),
        deleted_at: null,
      },
    ]);
    expect(
      await applyFizrukWellbeing(
        conflictClient,
        op("fizruk_wellbeing", { user_id: USER_ID, date_key: "2026-07-10" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "lww_conflict" });

    const tombstonedClient = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-07-01T00:00:00.000Z"),
        deleted_at: new Date("2026-06-01T00:00:00.000Z"),
      },
    ]);
    expect(
      await applyFizrukWellbeing(
        tombstonedClient,
        op("fizruk_wellbeing", { user_id: USER_ID, date_key: "2026-07-10" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "tombstoned" });
  });

  it("applyFizrukWellbeing rejects invalid energy / sleep_quality / sleep_hours / created_at", async () => {
    const base = { user_id: USER_ID, date_key: "2026-07-10" };
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...base, energy: "lots" }, "invalid_energy"],
      [{ ...base, sleep_quality: "great" }, "invalid_sleep_quality"],
      [{ ...base, sleep_hours: "many" }, "invalid_sleep_hours"],
      [{ ...base, created_at: "bad" }, "invalid_created_at"],
    ];
    for (const [row, reason] of cases) {
      const client = makeClient([]);
      const result = await applyFizrukWellbeing(
        client,
        op("fizruk_wellbeing", row),
        USER_ID,
        CLIENT_TS,
      );
      expect(result).toEqual({ status: "rejected", reason });
    }
  });

  it("applyFizrukWorkoutTemplates rejects on user_id mismatch and lww_conflict", async () => {
    const mismatchClient = makeClient([]);
    expect(
      await applyFizrukWorkoutTemplates(
        mismatchClient,
        op("fizruk_workout_templates", {
          id: "tpl-1",
          user_id: "someone-else",
          name: "Push day",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "user_id_mismatch" });

    const conflictClient = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-07-10T13:00:00.000Z"),
        deleted_at: null,
      },
    ]);
    expect(
      await applyFizrukWorkoutTemplates(
        conflictClient,
        op("fizruk_workout_templates", {
          id: "tpl-1",
          user_id: USER_ID,
          name: "Push day",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  it("applyFizrukWorkoutTemplates rejects invalid created_at / deleted_at / last_used_at", async () => {
    const base = { id: "tpl-1", user_id: USER_ID, name: "Push day" };
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...base, created_at: "bad" }, "invalid_created_at"],
      [{ ...base, deleted_at: "bad" }, "invalid_deleted_at"],
      [{ ...base, last_used_at: "bad" }, "invalid_last_used_at"],
    ];
    for (const [row, reason] of cases) {
      const client = makeClient([]);
      const result = await applyFizrukWorkoutTemplates(
        client,
        op("fizruk_workout_templates", row),
        USER_ID,
        CLIENT_TS,
      );
      expect(result).toEqual({ status: "rejected", reason });
    }
  });
});

describe("routine full-state remaining validation edge cases", () => {
  it("applyRoutineTags rejects on user_id mismatch, lww_conflict and invalid created_at", async () => {
    const mismatchClient = makeClient([]);
    expect(
      await applyRoutineTags(
        mismatchClient,
        op("routine_tags", { id: "tag-1", user_id: "someone-else" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "user_id_mismatch" });

    const conflictClient = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-07-10T13:00:00.000Z"),
        deleted_at: null,
      },
    ]);
    expect(
      await applyRoutineTags(
        conflictClient,
        op("routine_tags", { id: "tag-1", user_id: USER_ID, name: "x" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "lww_conflict" });

    const invalidDateClient = makeClient([]);
    expect(
      await applyRoutineTags(
        invalidDateClient,
        op("routine_tags", {
          id: "tag-1",
          user_id: USER_ID,
          name: "x",
          created_at: "bad-date",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "invalid_created_at" });
  });

  it("applyRoutineCategories rejects missing_name and invalid deleted_at", async () => {
    const missingNameClient = makeClient([]);
    expect(
      await applyRoutineCategories(
        missingNameClient,
        op("routine_categories", { id: "cat-1", user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "missing_name" });

    const invalidDeletedClient = makeClient([]);
    expect(
      await applyRoutineCategories(
        invalidDeletedClient,
        op("routine_categories", {
          id: "cat-1",
          user_id: USER_ID,
          name: "x",
          deleted_at: "bad-date",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "invalid_deleted_at" });
  });

  it("applyRoutinePrefs rejects on user_id mismatch", async () => {
    const client = makeClient([]);
    const result = await applyRoutinePrefs(
      client,
      op("routine_prefs", { user_id: "someone-else" }),
      USER_ID,
      CLIENT_TS,
    );
    expect(result).toEqual({ status: "rejected", reason: "user_id_mismatch" });
  });

  it("applyRoutinePushups rejects on user_id mismatch and lww_conflict", async () => {
    const mismatchClient = makeClient([]);
    expect(
      await applyRoutinePushups(
        mismatchClient,
        op("routine_pushups", {
          user_id: "someone-else",
          date_key: "2026-07-10",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "user_id_mismatch" });

    const conflictClient = makeClient([
      { user_id: USER_ID, updated_at: new Date("2026-07-10T13:00:00.000Z") },
    ]);
    expect(
      await applyRoutinePushups(
        conflictClient,
        op("routine_pushups", {
          user_id: USER_ID,
          date_key: "2026-07-10",
          reps: 10,
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  it("applyRoutineHabitOrder rejects delete ops, user_id mismatch and lww_conflict", async () => {
    const deleteClient = makeClient([]);
    expect(
      await applyRoutineHabitOrder(
        deleteClient,
        op("routine_habit_order", { user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "delete_not_supported" });

    const mismatchClient = makeClient([]);
    expect(
      await applyRoutineHabitOrder(
        mismatchClient,
        op("routine_habit_order", { user_id: "someone-else" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "user_id_mismatch" });

    const conflictClient = makeClient([
      { user_id: USER_ID, updated_at: new Date("2026-07-10T13:00:00.000Z") },
    ]);
    expect(
      await applyRoutineHabitOrder(
        conflictClient,
        op("routine_habit_order", { user_id: USER_ID, order: [] }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  it("applyRoutineCompletionNotes rejects on user_id mismatch and plain lww_conflict", async () => {
    const mismatchClient = makeClient([]);
    expect(
      await applyRoutineCompletionNotes(
        mismatchClient,
        op("routine_completion_notes", {
          user_id: "someone-else",
          note_key: "k",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "user_id_mismatch" });

    const conflictClient = makeClient([
      {
        user_id: USER_ID,
        updated_at: new Date("2026-07-10T13:00:00.000Z"),
        deleted_at: null,
      },
    ]);
    expect(
      await applyRoutineCompletionNotes(
        conflictClient,
        op("routine_completion_notes", {
          user_id: USER_ID,
          note_key: "k",
          note: "x",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).toEqual({ status: "rejected", reason: "lww_conflict" });
  });
});
