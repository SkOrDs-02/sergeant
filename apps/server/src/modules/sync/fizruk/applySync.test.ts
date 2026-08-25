import { describe, expect, it } from "vitest";

import { applyFizrukSets, applyFizrukWorkouts } from "./applySync.js";
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

describe("applyFizrukSets", () => {
  it("inserts a set with numeric defaults", async () => {
    const fake = new FakeClient();
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
});
