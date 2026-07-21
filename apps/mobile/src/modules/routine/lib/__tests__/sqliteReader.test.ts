import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

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
} from "../sqliteReader";

function makeClient(
  all: jest.Mock<Promise<unknown[]>, [string, unknown[]?]>,
): SqliteMigrationClient {
  return {
    all,
    exec: jest.fn(),
    run: jest.fn(),
  } as unknown as SqliteMigrationClient;
}

beforeEach(() => {
  clearSqliteCompletionsCache();
  clearSqliteRoutineStateCache();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("sqliteReader (mobile routine)", () => {
  it("groups valid completion row ids by habit and ignores malformed ids", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-03T12:00:00.000Z"));
    const all = jest.fn<Promise<unknown[]>, [string, unknown[]?]>(async () => [
      { id: "habit-1:2026-05-02" },
      { id: "habit-1:2026-05-01" },
      { id: "habit-2:2026-05-03" },
      { id: "habit-3:not-a-date" },
      { id: "missing-date:" },
      { id: ":missing-habit" },
      { id: "no-separator" },
    ]);
    const client = makeClient(all);

    const cache = await refreshSqliteCompletions(client, "user-1");

    expect(all).toHaveBeenCalledWith(
      expect.stringContaining("routine_entries"),
      ["user-1"],
    );
    expect(cache).toEqual({
      refreshedAt: "2026-05-03T12:00:00.000Z",
      completions: {
        "habit-1": ["2026-05-01", "2026-05-02"],
        "habit-2": ["2026-05-03"],
      },
    });
    expect(getCachedSqliteCompletions()).toBe(cache);
  });

  it("refreshes the full routine state cache from all SQLite tables", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-04T07:30:00.000Z"));
    const all = jest.fn<Promise<unknown[]>, [string, unknown[]?]>(
      async (sql) => {
        if (sql.includes("FROM routine_habits")) {
          return [
            {
              id: "habit-1",
              name: "Планка",
              emoji: "",
              tag_ids_json: '["tag-1"]',
              category_id: null,
              archived: 0,
              paused: 1,
              recurrence: "weekly",
              start_date: "2026-05-01",
              end_date: null,
              time_of_day: "",
              reminder_times_json: "not-json",
              weekdays_json: "[1,3,5]",
              created_at: "2026-05-01T00:00:00.000Z",
            },
          ];
        }
        if (sql.includes("FROM routine_tags")) {
          return [{ id: "tag-1", name: "Сила", scope: "" }];
        }
        if (sql.includes("FROM routine_categories")) {
          return [{ id: "cat-1", name: "Ранок", emoji: "🌅" }];
        }
        if (sql.includes("FROM routine_prefs")) {
          return [{ data_json: '{"showFizrukInCalendar":false}' }];
        }
        if (sql.includes("FROM routine_pushups")) {
          return [{ date_key: "2026-05-04", reps: 42 }];
        }
        if (sql.includes("FROM routine_habit_order")) {
          return [{ order_json: '["habit-1"]' }];
        }
        if (sql.includes("FROM routine_completion_notes")) {
          return [{ note_key: "habit-1:2026-05-04", note: "Легко" }];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    );
    const client = makeClient(all);

    const cache = await refreshSqliteRoutineState(client, "user-1");

    expect(cache.refreshedAt).toBe("2026-05-04T07:30:00.000Z");
    expect(cache.habits).toEqual([
      {
        id: "habit-1",
        name: "Планка",
        emoji: undefined,
        tagIds: ["tag-1"],
        categoryId: undefined,
        archived: false,
        paused: true,
        recurrence: "weekly",
        startDate: "2026-05-01",
        endDate: undefined,
        timeOfDay: undefined,
        reminderTimes: [],
        weekdays: [1, 3, 5],
        createdAt: "2026-05-01T00:00:00.000Z",
      },
    ]);
    expect(cache.tags).toEqual([
      { id: "tag-1", name: "Сила", scope: undefined },
    ]);
    expect(cache.categories).toEqual([
      { id: "cat-1", name: "Ранок", emoji: "🌅" },
    ]);
    expect(cache.prefs).toEqual({ showFizrukInCalendar: false });
    expect(cache.pushupsByDate).toEqual({ "2026-05-04": 42 });
    expect(cache.habitOrder).toEqual(["habit-1"]);
    expect(cache.completionNotes).toEqual({ "habit-1:2026-05-04": "Легко" });
    expect(getCachedSqliteRoutineState()).toBe(cache);
  });

  it("falls back to empty prefs and habit order when optional rows are absent or invalid", async () => {
    const all = jest.fn<Promise<unknown[]>, [string, unknown[]?]>(
      async (sql) => {
        if (sql.includes("FROM routine_habits")) return [];
        if (sql.includes("FROM routine_tags")) return [];
        if (sql.includes("FROM routine_categories")) return [];
        if (sql.includes("FROM routine_prefs")) return [];
        if (sql.includes("FROM routine_pushups")) return [];
        if (sql.includes("FROM routine_habit_order")) {
          return [{ order_json: "not-json" }];
        }
        if (sql.includes("FROM routine_completion_notes")) return [];
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    );

    const cache = await refreshSqliteRoutineState(makeClient(all), "user-1");

    expect(cache.prefs).toEqual({});
    expect(cache.habitOrder).toEqual([]);
    expect(cache.habits).toEqual([]);
  });

  it("supports write-through setters and test seed helpers", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-05T09:00:00.000Z"));

    setCachedSqliteCompletions({ "habit-1": ["2026-05-05"] });
    expect(getCachedSqliteCompletions()).toEqual({
      completions: { "habit-1": ["2026-05-05"] },
      refreshedAt: "2026-05-05T09:00:00.000Z",
    });

    setCachedSqliteRoutineState({
      habits: [],
      tags: [],
      categories: [],
      prefs: { routineRemindersEnabled: true },
      pushupsByDate: { "2026-05-05": 10 },
      habitOrder: ["habit-1"],
      completionNotes: { "habit-1:2026-05-05": "Ок" },
    });
    expect(getCachedSqliteRoutineState()).toMatchObject({
      prefs: { routineRemindersEnabled: true },
      pushupsByDate: { "2026-05-05": 10 },
      habitOrder: ["habit-1"],
      completionNotes: { "habit-1:2026-05-05": "Ок" },
      refreshedAt: "2026-05-05T09:00:00.000Z",
    });

    clearSqliteCompletionsCache();
    clearSqliteRoutineStateCache();
    expect(getCachedSqliteCompletions()).toEqual({
      completions: {},
      refreshedAt: null,
    });
    expect(getCachedSqliteRoutineState()).toMatchObject({
      habits: [],
      prefs: {},
      refreshedAt: null,
    });

    __setRoutineSqliteCompletionsCacheForTests({
      completions: { seeded: ["2026-05-05"] },
    });
    __setRoutineSqliteStateCacheForTests({
      prefs: { showFinykSubscriptionsInCalendar: false },
    });
    expect(getCachedSqliteCompletions().completions).toEqual({
      seeded: ["2026-05-05"],
    });
    expect(getCachedSqliteRoutineState().prefs).toEqual({
      showFinykSubscriptionsInCalendar: false,
    });
  });
});
