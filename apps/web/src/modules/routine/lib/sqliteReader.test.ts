import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setRoutineSqliteCompletionsCacheForTests,
  __setRoutineSqliteStateCacheForTests,
  clearSqliteCompletionsCache,
  clearSqliteRoutineStateCache,
  getCachedSqliteCompletions,
  getCachedSqliteRoutineState,
  refreshSqliteCompletions,
  refreshSqliteRoutineState,
  setCachedSqliteCompletions,
  setCachedSqliteRoutineState,
} from "./sqliteReader";

interface Row {
  [k: string]: unknown;
}

function makeClient(tables: Record<string, Row[]>) {
  return {
    all: vi.fn(async (sql: string) => {
      // crude dispatch on the FROM-table name in the SQL
      const match = /FROM\s+(\w+)/.exec(sql);
      const table = match?.[1] ?? "";
      return (tables[table] ?? []) as never;
    }),
  } as never;
}

describe("sqliteReader completions cache", () => {
  beforeEach(() => {
    clearSqliteCompletionsCache();
  });

  it("starts empty", () => {
    expect(getCachedSqliteCompletions()).toEqual({
      completions: {},
      refreshedAt: null,
    });
  });

  it("groups routine_entries rows by habit id and sorts dates", async () => {
    const client = makeClient({
      routine_entries: [
        { id: "h1:2026-01-03" },
        { id: "h1:2026-01-01" },
        { id: "h2:2026-02-01" },
        { id: "bad-no-date" }, // skipped (no colon)
        { id: "h3:not-a-date" }, // skipped (regex)
        { id: ":2026-01-01" }, // skipped (empty habit)
      ],
    });
    const cache = await refreshSqliteCompletions(client, "u1");
    expect(cache.completions).toEqual({
      h1: ["2026-01-01", "2026-01-03"],
      h2: ["2026-02-01"],
    });
    expect(cache.refreshedAt).not.toBeNull();
    expect(getCachedSqliteCompletions()).toBe(cache);
  });

  it("write-through update via setCachedSqliteCompletions", () => {
    setCachedSqliteCompletions({ h9: ["2026-03-03"] });
    expect(getCachedSqliteCompletions().completions).toEqual({
      h9: ["2026-03-03"],
    });
  });

  it("test helper seeds the completions cache", () => {
    __setRoutineSqliteCompletionsCacheForTests({ completions: { h1: ["x"] } });
    expect(getCachedSqliteCompletions().completions).toEqual({ h1: ["x"] });
  });
});

describe("sqliteReader full-state cache", () => {
  beforeEach(() => {
    clearSqliteRoutineStateCache();
  });

  it("starts empty", () => {
    const s = getCachedSqliteRoutineState();
    expect(s.refreshedAt).toBeNull();
    expect(s.habits).toEqual([]);
  });

  it("reads and maps all 7 tables", async () => {
    const client = makeClient({
      routine_habits: [
        {
          id: "h1",
          name: "Water",
          emoji: "💧",
          tag_ids_json: '["t1"]',
          category_id: "c1",
          archived: 0,
          paused: 1,
          recurrence: "daily",
          start_date: "2026-01-01",
          end_date: null,
          time_of_day: "morning",
          reminder_times_json: '["08:00"]',
          weekdays_json: "[1,2,3]",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      routine_tags: [{ id: "t1", name: "Health", scope: "" }],
      routine_categories: [{ id: "c1", name: "Body", emoji: "" }],
      routine_prefs: [{ data_json: '{"routineRemindersEnabled":true}' }],
      routine_pushups: [{ date_key: "2026-01-01", reps: 30 }],
      routine_habit_order: [{ order_json: '["h1"]' }],
      routine_completion_notes: [{ note_key: "h1:2026-01-01", note: "done" }],
    });
    const s = await refreshSqliteRoutineState(client, "u1");
    expect(s.habits[0]).toMatchObject({
      id: "h1",
      name: "Water",
      emoji: "💧",
      tagIds: ["t1"],
      categoryId: "c1",
      archived: false,
      paused: true,
      reminderTimes: ["08:00"],
      weekdays: [1, 2, 3],
    });
    expect(s.tags).toEqual([{ id: "t1", name: "Health", scope: undefined }]);
    expect(s.categories).toEqual([
      { id: "c1", name: "Body", emoji: undefined },
    ]);
    expect(s.prefs).toEqual({ routineRemindersEnabled: true });
    expect(s.pushupsByDate).toEqual({ "2026-01-01": 30 });
    expect(s.habitOrder).toEqual(["h1"]);
    expect(s.completionNotes).toEqual({ "h1:2026-01-01": "done" });
    expect(getCachedSqliteRoutineState()).toBe(s);
  });

  it("returns empty prefs/order when those tables are empty", async () => {
    const client = makeClient({});
    const s = await refreshSqliteRoutineState(client, "u1");
    expect(s.prefs).toEqual({});
    expect(s.habitOrder).toEqual([]);
    expect(s.pushupsByDate).toEqual({});
  });

  it("falls back to defaults on malformed JSON columns", async () => {
    const client = makeClient({
      routine_habits: [
        {
          id: "h1",
          name: "x",
          emoji: "",
          tag_ids_json: "not-json",
          category_id: null,
          archived: 1,
          paused: 0,
          recurrence: "daily",
          start_date: null,
          end_date: null,
          time_of_day: "",
          reminder_times_json: "{bad",
          weekdays_json: "nope",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    });
    const s = await refreshSqliteRoutineState(client, "u1");
    expect(s.habits[0]).toMatchObject({
      tagIds: [],
      reminderTimes: [],
      weekdays: [],
      archived: true,
      paused: false,
      emoji: undefined,
      categoryId: undefined,
    });
  });

  it("write-through update via setCachedSqliteRoutineState", () => {
    setCachedSqliteRoutineState({
      habits: [],
      tags: [],
      categories: [],
      prefs: { routineRemindersEnabled: true },
      pushupsByDate: { "2026-01-01": 5 },
      habitOrder: ["h1"],
      completionNotes: {},
    });
    const s = getCachedSqliteRoutineState();
    expect(s.refreshedAt).not.toBeNull();
    expect(s.habitOrder).toEqual(["h1"]);
  });

  it("test helper seeds the full-state cache", () => {
    __setRoutineSqliteStateCacheForTests({ habitOrder: ["a", "b"] });
    expect(getCachedSqliteRoutineState().habitOrder).toEqual(["a", "b"]);
  });
});
