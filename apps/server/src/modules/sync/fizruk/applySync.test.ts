import { describe, expect, it } from "vitest";

import {
  applyFizrukItems,
  applyFizrukSets,
  applyFizrukWorkouts,
} from "./applySync.js";
import {
  asClient,
  FakeClient,
  lastQuery,
  syncOp,
} from "./__tests__/testHelpers.js";

// applyFizrukCustomExercises / applyFizrukMeasurements (applyMisc.ts) і
// applyFizrukInjuries (applyInjuries.ts) мають власні колоковані
// поведінкові тести — apps/server/src/modules/sync/fizruk/applyMisc.test.ts
// і apps/server/src/modules/sync/fizruk/applyInjuries.test.ts. Цей файл
// покриває лише функції, визначені безпосередньо в applySync.ts.

describe("applyFizrukWorkouts", () => {
  it("rejects invalid started_at after ownership lookup", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukWorkouts(
        asClient(fake),
        syncOp("fizruk_workouts", "insert", {
          id: "workout-1",
          user_id: "user-1",
          started_at: "not-a-date",
        }),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_started_at" });
    expect(fake.queries).toHaveLength(1);
  });

  it("soft-deletes existing workouts with the client timestamp", async () => {
    const fake = new FakeClient();
    const clientTs = new Date("2026-07-21T08:00:00.000Z");
    fake.queueRows([
      { user_id: "user-1", updated_at: new Date("2026-07-21T07:00:00.000Z") },
    ]);

    await expect(
      applyFizrukWorkouts(
        asClient(fake),
        syncOp("fizruk_workouts", "delete", {
          id: "workout-1",
          user_id: "user-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const update = lastQuery(fake);
    expect(update.sql).toContain("UPDATE fizruk_workouts");
    expect(update.params).toEqual([clientTs, "workout-1", "user-1"]);
  });
});

// data-11: контракт для рядків, які шле веб-асистент (log_set / plan_workout).
// Клієнт тепер завжди резолвить назву в каталожний або `custom_*` id, тож
// item приймається; порожній `exercise_id` лишається термінальною відмовою
// (її більше не повинен слати жоден клієнтський шлях).
describe("applyFizrukItems — рядки з чат-екзекуторів (data-11)", () => {
  const chatRow = (exerciseId: string) => ({
    id: "i_chat_1",
    user_id: "user-1",
    workout_id: "w_chat_1",
    exercise_id: exerciseId,
    name_uk: "Мій рух",
    primary_group: "full_body",
    muscles_primary: "[]",
    muscles_secondary: "[]",
    type: "strength",
    duration_sec: 0,
    distance_m: 0,
    chosen_variant: null,
    sort_order: 0,
  });

  it.each([
    ["каталожний id", "deadlift"],
    ["custom-вправа з генератора AddExerciseSheet", "custom_1790000000000"],
  ])(
    "приймає item з непорожнім exercise_id: %s",
    async (_label, exerciseId) => {
      const fake = new FakeClient();
      const clientTs = new Date("2026-07-21T08:00:00.000Z");
      await expect(
        applyFizrukItems(
          asClient(fake),
          syncOp("fizruk_workout_items", "insert", chatRow(exerciseId)),
          "user-1",
          clientTs,
        ),
      ).resolves.toEqual({ status: "applied" });
      const insert = lastQuery(fake);
      expect(insert.sql).toContain("INSERT INTO fizruk_workout_items");
      expect(insert.params[3]).toBe(exerciseId);
    },
  );

  it("порожній exercise_id — термінальна відмова missing_exercise_id", async () => {
    const fake = new FakeClient();
    await expect(
      applyFizrukItems(
        asClient(fake),
        syncOp("fizruk_workout_items", "insert", chatRow("")),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_exercise_id" });
    expect(fake.queries.every((q) => !/^\s*INSERT/i.test(q.sql))).toBe(true);
  });
});

describe("applyFizrukSets", () => {
  it("inserts a set with numeric defaults", async () => {
    const fake = new FakeClient();
    fake.queueRows([]); // ownership lookup за id підходу
    fake.queueRows([{ "?column?": 1 }]); // батьківська позиція — власна
    const clientTs = new Date("2026-07-21T08:00:00.000Z");

    await expect(
      applyFizrukSets(
        asClient(fake),
        syncOp("fizruk_workout_sets", "insert", {
          id: "set-1",
          user_id: "user-1",
          workout_item_id: "item-1",
          sort_order: -10,
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const insert = lastQuery(fake);
    expect(insert.sql).toContain("INSERT INTO fizruk_workout_sets");
    expect(insert.params).toEqual([
      "set-1",
      "item-1",
      "user-1",
      0,
      0,
      null,
      0,
      clientTs,
      clientTs,
      null,
    ]);
  });

  it("rejects invalid reps before insert", async () => {
    const fake = new FakeClient();

    await expect(
      applyFizrukSets(
        asClient(fake),
        syncOp("fizruk_workout_sets", "insert", {
          id: "set-1",
          user_id: "user-1",
          workout_item_id: "item-1",
          reps: "ten",
        }),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_reps" });
    expect(fake.queries).toHaveLength(1);
  });

  // W4 — до цієї правки `weight_kg`/`reps` парсились НЕобмеженим
  // `parseOptionalNumber`/`parseOptionalInt` (лише "це скінченне число?"),
  // на відміну від сусідніх замірів тіла (`fizruk_measurements`), які вже
  // мали `parseOptionalBoundedNumber`/`Int`. Межі — `syncV2-core.ts`
  // (`WORKOUT_SET_WEIGHT_KG_BOUNDS` / `WORKOUT_SET_REPS_BOUNDS`, 0..1000 —
  // ті самі, що клієнтська форма підходу).
  describe("weight_kg / reps bounds (W4)", () => {
    it("rejects weight_kg above the 1000kg ceiling", async () => {
      const fake = new FakeClient();

      await expect(
        applyFizrukSets(
          asClient(fake),
          syncOp("fizruk_workout_sets", "insert", {
            id: "set-1",
            user_id: "user-1",
            workout_item_id: "item-1",
            weight_kg: 1000.01,
          }),
          "user-1",
          new Date("2026-07-21T08:00:00.000Z"),
        ),
      ).resolves.toEqual({ status: "rejected", reason: "invalid_weight_kg" });
      expect(fake.queries).toHaveLength(1); // тільки ownership SELECT — без DML
    });

    it("rejects negative weight_kg", async () => {
      const fake = new FakeClient();

      await expect(
        applyFizrukSets(
          asClient(fake),
          syncOp("fizruk_workout_sets", "insert", {
            id: "set-1",
            user_id: "user-1",
            workout_item_id: "item-1",
            weight_kg: -1,
          }),
          "user-1",
          new Date("2026-07-21T08:00:00.000Z"),
        ),
      ).resolves.toEqual({ status: "rejected", reason: "invalid_weight_kg" });
      expect(fake.queries).toHaveLength(1);
    });

    it("rejects reps above the 1000 ceiling", async () => {
      const fake = new FakeClient();

      await expect(
        applyFizrukSets(
          asClient(fake),
          syncOp("fizruk_workout_sets", "insert", {
            id: "set-1",
            user_id: "user-1",
            workout_item_id: "item-1",
            reps: 1001,
          }),
          "user-1",
          new Date("2026-07-21T08:00:00.000Z"),
        ),
      ).resolves.toEqual({ status: "rejected", reason: "invalid_reps" });
      expect(fake.queries).toHaveLength(1);
    });

    it("rejects negative reps", async () => {
      const fake = new FakeClient();

      await expect(
        applyFizrukSets(
          asClient(fake),
          syncOp("fizruk_workout_sets", "insert", {
            id: "set-1",
            user_id: "user-1",
            workout_item_id: "item-1",
            reps: -5,
          }),
          "user-1",
          new Date("2026-07-21T08:00:00.000Z"),
        ),
      ).resolves.toEqual({ status: "rejected", reason: "invalid_reps" });
      expect(fake.queries).toHaveLength(1);
    });

    it("accepts boundary values (weight_kg=1000, reps=1000) and inserts them as-is", async () => {
      const fake = new FakeClient();
      fake.queueRows([]); // ownership lookup за id підходу
      fake.queueRows([{ "?column?": 1 }]); // батьківська позиція — власна
      const clientTs = new Date("2026-07-21T08:00:00.000Z");

      await expect(
        applyFizrukSets(
          asClient(fake),
          syncOp("fizruk_workout_sets", "insert", {
            id: "set-1",
            user_id: "user-1",
            workout_item_id: "item-1",
            weight_kg: 1000,
            reps: 1000,
          }),
          "user-1",
          clientTs,
        ),
      ).resolves.toEqual({ status: "applied" });

      const insert = lastQuery(fake);
      expect(insert.sql).toContain("INSERT INTO fizruk_workout_sets");
      expect(insert.params).toEqual([
        "set-1",
        "item-1",
        "user-1",
        1000,
        1000,
        null,
        0,
        clientTs,
        clientTs,
        null,
      ]);
    });
  });
});
