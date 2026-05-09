import { describe, expect, it } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type { FizrukDualWriteState, FizrukWorkoutSnapshot } from "../diff.js";
import { probeFizrukParity } from "../parity.js";
import { createTestSqlite } from "./testSqlite.js";

const USER_ID = "user-1";
const TS = "2026-05-08T10:00:00.000Z";

const EMPTY_STATE: FizrukDualWriteState = {
  workouts: [],
  customExercises: [],
  measurements: [],
  dailyLog: [],
  monthlyPlan: null,
  workoutTemplates: [],
};

async function seedWorkout(
  client: SqliteMigrationClient,
  id: string,
  opts: { deletedAt?: string | null } = {},
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_workouts
       (id, user_id, started_at, ended_at, note, groups_json,
        warmup_json, cooldown_json, wellbeing_json,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, NULL, '', '[]', NULL, NULL, NULL, ?, ?, ?)`,
    [id, USER_ID, TS, TS, TS, opts.deletedAt ?? null],
  );
}

async function seedCustomExercise(
  client: SqliteMigrationClient,
  id: string,
  opts: { deletedAt?: string | null } = {},
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_custom_exercises
       (id, user_id, data_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, '{}', ?, ?, ?)`,
    [id, USER_ID, TS, TS, opts.deletedAt ?? null],
  );
}

async function seedMeasurement(
  client: SqliteMigrationClient,
  id: string,
  opts: { deletedAt?: string | null } = {},
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_measurements
       (id, user_id, measured_at, weight_kg, waist_cm, chest_cm, hips_cm,
        bicep_cm, sleep_hours, energy_level, mood,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
             ?, ?, ?)`,
    [id, USER_ID, TS, TS, TS, opts.deletedAt ?? null],
  );
}

describe("probeFizrukParity", () => {
  it("reports match when both sides are empty", async () => {
    const handle = await createTestSqlite();
    try {
      const out = await probeFizrukParity(handle.client, USER_ID, EMPTY_STATE);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({
        workouts: { ls: 0, sqlite: 0 },
        customExercises: { ls: 0, sqlite: 0 },
        measurements: { ls: 0, sqlite: 0 },
        dailyLog: { ls: 0, sqlite: 0 },
        workoutTemplates: { ls: 0, sqlite: 0 },
        monthlyPlan: { ls: false, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });

  it("reports match when LS and SQLite agree on every entity class", async () => {
    const handle = await createTestSqlite();
    try {
      await seedWorkout(handle.client, "w1");
      await seedWorkout(handle.client, "w2");
      await seedCustomExercise(handle.client, "cex1");
      await seedMeasurement(handle.client, "m1");
      await seedMeasurement(handle.client, "m2");

      const next: FizrukDualWriteState = {
        ...EMPTY_STATE,
        workouts: [makeWorkout("w1"), makeWorkout("w2")],
        customExercises: [{ id: "cex1" }],
        measurements: [
          { id: "m1", at: TS },
          { id: "m2", at: TS },
        ],
      };

      const out = await probeFizrukParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({
        workouts: { ls: 2, sqlite: 2 },
        customExercises: { ls: 1, sqlite: 1 },
        measurements: { ls: 2, sqlite: 2 },
        dailyLog: { ls: 0, sqlite: 0 },
        workoutTemplates: { ls: 0, sqlite: 0 },
        monthlyPlan: { ls: false, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });

  it("ignores soft-deleted SQLite rows in the parity comparison", async () => {
    const handle = await createTestSqlite();
    try {
      await seedWorkout(handle.client, "w1");
      await seedWorkout(handle.client, "w2", { deletedAt: TS });
      await seedCustomExercise(handle.client, "cex1", { deletedAt: TS });
      await seedMeasurement(handle.client, "m1");

      const next: FizrukDualWriteState = {
        ...EMPTY_STATE,
        workouts: [makeWorkout("w1")],
        customExercises: [],
        measurements: [{ id: "m1", at: TS }],
      };

      const out = await probeFizrukParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({
        workouts: { ls: 1, sqlite: 1 },
        customExercises: { ls: 0, sqlite: 0 },
        measurements: { ls: 1, sqlite: 1 },
        dailyLog: { ls: 0, sqlite: 0 },
        workoutTemplates: { ls: 0, sqlite: 0 },
        monthlyPlan: { ls: false, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch with lsOnly when SQLite is missing a workout", async () => {
    const handle = await createTestSqlite();
    try {
      await seedWorkout(handle.client, "w1");

      const next: FizrukDualWriteState = {
        ...EMPTY_STATE,
        workouts: [makeWorkout("w1"), makeWorkout("w2")],
        customExercises: [],
        measurements: [],
      };

      const out = await probeFizrukParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toEqual({
        workouts: { ls: 2, sqlite: 1, lsOnly: 1, sqliteOnly: 0 },
        customExercises: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        measurements: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        dailyLog: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        workoutTemplates: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        monthlyPlan: { ls: false, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch with sqliteOnly when SQLite has stale rows", async () => {
    const handle = await createTestSqlite();
    try {
      await seedMeasurement(handle.client, "m1");
      await seedMeasurement(handle.client, "m2");
      await seedMeasurement(handle.client, "m3");

      const next: FizrukDualWriteState = {
        ...EMPTY_STATE,
        workouts: [],
        customExercises: [],
        measurements: [{ id: "m1", at: TS }],
      };

      const out = await probeFizrukParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toEqual({
        workouts: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        customExercises: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        measurements: { ls: 1, sqlite: 3, lsOnly: 0, sqliteOnly: 2 },
        dailyLog: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        workoutTemplates: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        monthlyPlan: { ls: false, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch with both lsOnly and sqliteOnly when sets diverge symmetrically", async () => {
    const handle = await createTestSqlite();
    try {
      await seedCustomExercise(handle.client, "cex-old");

      const next: FizrukDualWriteState = {
        ...EMPTY_STATE,
        workouts: [],
        customExercises: [{ id: "cex-new" }],
        measurements: [],
      };

      const out = await probeFizrukParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toEqual({
        workouts: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        customExercises: { ls: 1, sqlite: 1, lsOnly: 1, sqliteOnly: 1 },
        measurements: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        dailyLog: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        workoutTemplates: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        monthlyPlan: { ls: false, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch when only one entity class diverges", async () => {
    const handle = await createTestSqlite();
    try {
      await seedWorkout(handle.client, "w1");
      await seedCustomExercise(handle.client, "cex1");
      // Measurements diverge: SQLite has m1, m2; LS has only m1.
      await seedMeasurement(handle.client, "m1");
      await seedMeasurement(handle.client, "m2");

      const next: FizrukDualWriteState = {
        ...EMPTY_STATE,
        workouts: [makeWorkout("w1")],
        customExercises: [{ id: "cex1" }],
        measurements: [{ id: "m1", at: TS }],
      };

      const out = await probeFizrukParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toEqual({
        workouts: { ls: 1, sqlite: 1, lsOnly: 0, sqliteOnly: 0 },
        customExercises: { ls: 1, sqlite: 1, lsOnly: 0, sqliteOnly: 0 },
        measurements: { ls: 1, sqlite: 2, lsOnly: 0, sqliteOnly: 1 },
        dailyLog: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        workoutTemplates: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
        monthlyPlan: { ls: false, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });

  it("scopes the read to user_id so other users' rows don't leak in", async () => {
    const handle = await createTestSqlite();
    try {
      await handle.client.run(
        `INSERT INTO fizruk_workouts
           (id, user_id, started_at, ended_at, note, groups_json,
            warmup_json, cooldown_json, wellbeing_json,
            created_at, updated_at, deleted_at)
         VALUES ('other-w', 'user-2', ?, NULL, '', '[]',
                 NULL, NULL, NULL, ?, ?, NULL)`,
        [TS, TS, TS],
      );
      await seedWorkout(handle.client, "w1");

      const next: FizrukDualWriteState = {
        ...EMPTY_STATE,
        workouts: [makeWorkout("w1")],
        customExercises: [],
        measurements: [],
      };

      const out = await probeFizrukParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({
        workouts: { ls: 1, sqlite: 1 },
        customExercises: { ls: 0, sqlite: 0 },
        measurements: { ls: 0, sqlite: 0 },
        dailyLog: { ls: 0, sqlite: 0 },
        workoutTemplates: { ls: 0, sqlite: 0 },
        monthlyPlan: { ls: false, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });

  it("ignores LS entries with empty or non-string ids", async () => {
    const handle = await createTestSqlite();
    try {
      await seedWorkout(handle.client, "w1");

      // Inject malformed entries (empty id, non-string id) past the
      // type-check. The probe must defensively skip them rather than
      // surface a phantom mismatch.
      const malformedWorkouts = [
        makeWorkout("w1"),
        { ...makeWorkout(""), id: "" },
        { ...makeWorkout("ignored"), id: 42 },
      ] as unknown as readonly FizrukWorkoutSnapshot[];

      const next: FizrukDualWriteState = {
        ...EMPTY_STATE,
        workouts: malformedWorkouts,
        customExercises: [],
        measurements: [],
      };

      const out = await probeFizrukParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({
        workouts: { ls: 1, sqlite: 1 },
        customExercises: { ls: 0, sqlite: 0 },
        measurements: { ls: 0, sqlite: 0 },
        dailyLog: { ls: 0, sqlite: 0 },
        workoutTemplates: { ls: 0, sqlite: 0 },
        monthlyPlan: { ls: false, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });

  // -- Stage 12 / PR #070f-dualwrite — daily-log probe --

  it("reports match when LS and SQLite agree on daily-log rows", async () => {
    const handle = await createTestSqlite();
    try {
      await seedDailyLog(handle.client, "d1");
      await seedDailyLog(handle.client, "d2");

      const next: FizrukDualWriteState = {
        ...EMPTY_STATE,
        dailyLog: [
          {
            id: "d1",
            at: TS,
            weightKg: null,
            sleepHours: null,
            energyLevel: null,
            mood: null,
            note: "",
          },
          {
            id: "d2",
            at: TS,
            weightKg: null,
            sleepHours: null,
            energyLevel: null,
            mood: null,
            note: "",
          },
        ],
      };

      const out = await probeFizrukParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toMatchObject({
        dailyLog: { ls: 2, sqlite: 2 },
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch when daily-log rows diverge", async () => {
    const handle = await createTestSqlite();
    try {
      await seedDailyLog(handle.client, "d1");

      const next: FizrukDualWriteState = {
        ...EMPTY_STATE,
        dailyLog: [
          {
            id: "d2",
            at: TS,
            weightKg: null,
            sleepHours: null,
            energyLevel: null,
            mood: null,
            note: "",
          },
        ],
      };

      const out = await probeFizrukParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toMatchObject({
        dailyLog: { ls: 1, sqlite: 1, lsOnly: 1, sqliteOnly: 1 },
      });
    } finally {
      handle.close();
    }
  });

  // -- Stage 12 / PR #070f-dualwrite — workout-template probe --

  it("reports match when LS and SQLite agree on workout-template rows", async () => {
    const handle = await createTestSqlite();
    try {
      await seedWorkoutTemplate(handle.client, "t1");

      const next: FizrukDualWriteState = {
        ...EMPTY_STATE,
        workoutTemplates: [
          {
            id: "t1",
            name: "Push",
            exerciseIds: [],
            groups: [],
            updatedAt: TS,
          },
        ],
      };

      const out = await probeFizrukParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toMatchObject({
        workoutTemplates: { ls: 1, sqlite: 1 },
      });
    } finally {
      handle.close();
    }
  });

  // -- Stage 12 / PR #070f-dualwrite — monthly-plan probe --

  it("reports match when both sides have identical monthly-plan blob", async () => {
    const handle = await createTestSqlite();
    const json = '{"reminderEnabled":true}';
    try {
      await seedMonthlyPlan(handle.client, json);

      const next: FizrukDualWriteState = {
        ...EMPTY_STATE,
        monthlyPlan: { dataJson: json },
      };

      const out = await probeFizrukParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toMatchObject({
        monthlyPlan: { ls: true, sqlite: true, equal: true },
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch when monthly-plan blobs differ", async () => {
    const handle = await createTestSqlite();
    try {
      await seedMonthlyPlan(handle.client, '{"reminderEnabled":true}');

      const next: FizrukDualWriteState = {
        ...EMPTY_STATE,
        monthlyPlan: { dataJson: '{"reminderEnabled":false}' },
      };

      const out = await probeFizrukParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toMatchObject({
        monthlyPlan: { ls: true, sqlite: true },
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch when only LS has monthly-plan", async () => {
    const handle = await createTestSqlite();
    try {
      const next: FizrukDualWriteState = {
        ...EMPTY_STATE,
        monthlyPlan: { dataJson: "{}" },
      };

      const out = await probeFizrukParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toMatchObject({
        monthlyPlan: { ls: true, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });
});

async function seedDailyLog(
  client: SqliteMigrationClient,
  id: string,
  opts: { deletedAt?: string | null } = {},
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_daily_log
       (id, user_id, entry_at, weight_kg, sleep_hours, energy_level, mood,
        note, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, NULL, NULL, NULL, NULL, '', ?, ?, ?)`,
    [id, USER_ID, TS, TS, TS, opts.deletedAt ?? null],
  );
}

async function seedWorkoutTemplate(
  client: SqliteMigrationClient,
  id: string,
  opts: { deletedAt?: string | null } = {},
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_workout_templates
       (id, user_id, name, exercise_ids_json, groups_json,
        last_used_at, created_at, updated_at, deleted_at)
     VALUES (?, ?, 'tpl', '[]', '[]', NULL, ?, ?, ?)`,
    [id, USER_ID, TS, TS, opts.deletedAt ?? null],
  );
}

async function seedMonthlyPlan(
  client: SqliteMigrationClient,
  dataJson: string,
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_monthly_plan
       (user_id, data_json, updated_at)
     VALUES (?, ?, ?)`,
    [USER_ID, dataJson, TS],
  );
}

function makeWorkout(id: string) {
  return {
    id,
    startedAt: TS,
    endedAt: null,
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
  };
}
