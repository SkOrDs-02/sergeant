/**
 * Focused mapper coverage for the mobile Fizruk SQLite reader.
 */
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import {
  clearFizrukSqliteCache,
  getCachedFizrukSqliteState,
  refreshFizrukSqliteState,
} from "../sqliteReader";

function makeClient(rows: readonly unknown[][]): SqliteMigrationClient {
  const all = jest.fn<Promise<unknown[]>, [string, unknown[]]>();
  for (const rowSet of rows) {
    all.mockResolvedValueOnce([...rowSet]);
  }
  return { all } as unknown as SqliteMigrationClient;
}

describe("refreshFizrukSqliteState", () => {
  beforeEach(() => {
    clearFizrukSqliteCache();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-06T07:08:09.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
    clearFizrukSqliteCache();
  });

  it("maps every Fizruk table into the warm cache shape", async () => {
    const client = makeClient([
      [
        {
          id: "w1",
          started_at: "2026-05-05T10:00:00.000Z",
          ended_at: null,
          note: null,
          groups_json: '[{"id":"g1","label":"Push"}]',
          warmup_json: null,
          cooldown_json: "not-json",
          wellbeing_json: null,
        },
      ],
      [
        {
          id: "item1",
          workout_id: "w1",
          exercise_id: null,
          name_uk: "Жим лежачи",
          primary_group: "chest",
          muscles_primary: '["chest"]',
          muscles_secondary: "not-json",
          type: "unexpected",
          duration_sec: 90,
          distance_m: 250,
          sort_order: 0,
        },
      ],
      [
        {
          id: "set1",
          workout_item_id: "item1",
          weight_kg: 80,
          reps: 5,
          rpe: 8,
          sort_order: 0,
        },
      ],
      [
        {
          id: "custom1",
          data_json: JSON.stringify({
            id: "stale",
            name: { uk: "Тяга блоку", en: "Cable row" },
            primaryGroup: "back",
          }),
        },
        { id: "bad-custom", data_json: "not-json" },
      ],
      [
        {
          id: "m1",
          measured_at: "2026-05-05T06:00:00.000Z",
          weight_kg: 82.4,
          waist_cm: 88,
          chest_cm: 102,
          hips_cm: 99,
          bicep_cm: 35,
          sleep_hours: 7.5,
          energy_level: 4,
          mood: 5,
        },
      ],
      [
        {
          id: "dl1",
          entry_at: "2026-05-05T00:00:00.000Z",
          weight_kg: null,
          sleep_hours: 7,
          energy_level: 3,
          mood: null,
          note: null,
        },
      ],
      [
        {
          data_json: JSON.stringify({
            reminderEnabled: false,
            reminderHour: 26,
            reminderMinute: -5,
            days: {
              "2026-05-06": { templateId: "tpl1" },
              "2026-05-07": { templateId: 42 },
            },
          }),
        },
      ],
      [
        {
          id: "tpl1",
          name: null,
          exercise_ids_json: '["bench"]',
          groups_json: "not-json",
          last_used_at: null,
          updated_at: null,
        },
      ],
      [{ active_program_id: "" }],
      [{ data_json: null }],
      [
        {
          date_key: "2026-05-05",
          mood: 4,
          energy: null,
          sleep_quality: 5,
          sleep_hours: 7.25,
          notes: null,
          updated_at: null,
        },
      ],
    ]);

    const cache = await refreshFizrukSqliteState(client, "user-1");

    expect(cache).toBe(getCachedFizrukSqliteState());
    expect(cache.refreshedAt).toBe("2026-05-06T07:08:09.000Z");
    expect(cache.workouts).toHaveLength(1);
    expect(cache.workouts[0]).toMatchObject({
      id: "w1",
      note: "",
      cooldown: [],
      groups: [{ id: "g1", label: "Push" }],
    });
    expect(cache.workouts[0]?.items[0]).toMatchObject({
      id: "item1",
      exerciseId: "",
      nameUk: "Жим лежачи",
      type: "strength",
      durationSec: 90,
      distanceM: 250,
      sets: [{ weightKg: 80, reps: 5, rpe: 8 }],
    });
    expect(cache.customExercises).toEqual([
      {
        id: "custom1",
        name: { uk: "Тяга блоку", en: "Cable row" },
        primaryGroup: "back",
      },
    ]);
    expect(cache.measurements[0]).toMatchObject({
      id: "m1",
      at: "2026-05-05T06:00:00.000Z",
      bicepLCm: 35,
      bicepRCm: 35,
      mood: 5,
    });
    expect(cache.dailyLog[0]).toEqual({
      id: "dl1",
      at: "2026-05-05T00:00:00.000Z",
      weightKg: null,
      sleepHours: 7,
      energyLevel: 3,
      mood: null,
      note: "",
    });
    expect(cache.monthlyPlan).toEqual({
      reminderEnabled: false,
      reminderHour: 23,
      reminderMinute: 0,
      days: { "2026-05-06": { templateId: "tpl1" } },
    });
    expect(cache.workoutTemplates[0]).toEqual({
      id: "tpl1",
      name: "",
      exerciseIds: ["bench"],
      groups: [],
      updatedAt: "",
      lastUsedAt: null,
    });
    expect(cache.programs).toEqual({ activeProgramId: null });
    expect(cache.planTemplate).toEqual({ dataJson: "null" });
    expect(cache.wellbeing[0]).toEqual({
      date: "2026-05-05",
      mood: 4,
      energy: null,
      sleepQuality: 5,
      sleepHours: 7.25,
      notes: "",
      updatedAt: "",
    });
  });
});
