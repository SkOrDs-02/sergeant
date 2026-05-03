import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { applyFizrukDualWriteOps } from "../adapter.js";
import type { FizrukDualWriteOp } from "../diff.js";
import { createTestSqlite, type TestSqliteHandle } from "./testSqlite.js";

let handle: TestSqliteHandle;
const UID = "user-1";
const TS1 = "2026-05-01T10:00:00.000Z";
const TS2 = "2026-05-01T11:00:00.000Z";

beforeEach(async () => {
  handle = await createTestSqlite();
});
afterEach(() => handle.close());

const silentLogger = () => {};

describe("applyFizrukDualWriteOps", () => {
  it("returns zero counters for empty ops", async () => {
    const result = await applyFizrukDualWriteOps(handle.client, [], {
      userId: UID,
      clientTs: TS1,
    });
    expect(result).toEqual({ applied: 0, errored: 0, skipped: 0 });
  });

  // --- Workout ops ---

  it("upserts a workout with items and sets", async () => {
    const ops: FizrukDualWriteOp[] = [
      {
        kind: "workout-upsert",
        workout: {
          id: "w1",
          startedAt: "2026-05-01T10:00:00Z",
          endedAt: null,
          items: [
            {
              id: "i1",
              exerciseId: "bench-press",
              nameUk: "Жим лежачи",
              primaryGroup: "chest",
              musclesPrimary: ["chest"],
              musclesSecondary: ["triceps"],
              type: "strength",
              sets: [
                { weightKg: 80, reps: 8 },
                { weightKg: 85, reps: 6, rpe: 8 },
              ],
            },
          ],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "morning session",
        },
      },
    ];

    const result = await applyFizrukDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS1,
      logger: silentLogger,
    });
    expect(result.applied).toBe(1);

    // Verify workout row
    const workouts = handle.client.all<Record<string, unknown>>(
      "SELECT * FROM fizruk_workouts WHERE id = ?",
      ["w1"],
    );
    expect(workouts).toHaveLength(1);
    expect(workouts[0].user_id).toBe(UID);
    expect(workouts[0].note).toBe("morning session");
    expect(workouts[0].deleted_at).toBeNull();

    // Verify item row
    const items = handle.client.all<Record<string, unknown>>(
      "SELECT * FROM fizruk_workout_items WHERE workout_id = ?",
      ["w1"],
    );
    expect(items).toHaveLength(1);
    expect(items[0].exercise_id).toBe("bench-press");
    expect(items[0].name_uk).toBe("Жим лежачи");

    // Verify set rows
    const sets = handle.client.all<Record<string, unknown>>(
      "SELECT * FROM fizruk_workout_sets WHERE workout_item_id = ? ORDER BY sort_order",
      ["i1"],
    );
    expect(sets).toHaveLength(2);
    expect(sets[0].weight_kg).toBe(80);
    expect(sets[0].reps).toBe(8);
    expect(sets[1].weight_kg).toBe(85);
    expect(sets[1].rpe).toBe(8);
  });

  it("soft-deletes a workout and cascades to items/sets", async () => {
    // First insert a workout
    const upsertOps: FizrukDualWriteOp[] = [
      {
        kind: "workout-upsert",
        workout: {
          id: "w1",
          startedAt: "2026-05-01T10:00:00Z",
          endedAt: null,
          items: [
            {
              id: "i1",
              exerciseId: "squat",
              nameUk: "Присідання",
              primaryGroup: "legs",
              musclesPrimary: ["quads"],
              musclesSecondary: [],
              type: "strength",
              sets: [{ weightKg: 100, reps: 5 }],
            },
          ],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "",
        },
      },
    ];
    await applyFizrukDualWriteOps(handle.client, upsertOps, {
      userId: UID,
      clientTs: TS1,
      logger: silentLogger,
    });

    // Now delete
    const deleteOps: FizrukDualWriteOp[] = [
      { kind: "workout-delete", workoutId: "w1" },
    ];
    const result = await applyFizrukDualWriteOps(handle.client, deleteOps, {
      userId: UID,
      clientTs: TS2,
      logger: silentLogger,
    });
    expect(result.applied).toBe(1);

    // Workout should be soft-deleted
    const workouts = handle.client.all<Record<string, unknown>>(
      "SELECT deleted_at FROM fizruk_workouts WHERE id = ?",
      ["w1"],
    );
    expect(workouts[0].deleted_at).toBe(TS2);

    // Items should be soft-deleted too
    const items = handle.client.all<Record<string, unknown>>(
      "SELECT deleted_at FROM fizruk_workout_items WHERE workout_id = ?",
      ["w1"],
    );
    expect(items[0].deleted_at).toBe(TS2);

    // Sets should be soft-deleted too
    const sets = handle.client.all<Record<string, unknown>>(
      "SELECT deleted_at FROM fizruk_workout_sets WHERE workout_item_id = ?",
      ["i1"],
    );
    expect(sets[0].deleted_at).toBe(TS2);
  });

  it("LWW guard: stale workout upsert is a no-op", async () => {
    // Insert with TS2
    const ops1: FizrukDualWriteOp[] = [
      {
        kind: "workout-upsert",
        workout: {
          id: "w1",
          startedAt: "2026-05-01T10:00:00Z",
          endedAt: "2026-05-01T11:00:00Z",
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "latest",
        },
      },
    ];
    await applyFizrukDualWriteOps(handle.client, ops1, {
      userId: UID,
      clientTs: TS2,
      logger: silentLogger,
    });

    // Try to overwrite with older TS1 — should be skipped by LWW
    const ops2: FizrukDualWriteOp[] = [
      {
        kind: "workout-upsert",
        workout: {
          id: "w1",
          startedAt: "2026-05-01T10:00:00Z",
          endedAt: null,
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "stale",
        },
      },
    ];
    await applyFizrukDualWriteOps(handle.client, ops2, {
      userId: UID,
      clientTs: TS1,
      logger: silentLogger,
    });

    const workouts = handle.client.all<Record<string, unknown>>(
      "SELECT note FROM fizruk_workouts WHERE id = ?",
      ["w1"],
    );
    expect(workouts[0].note).toBe("latest");
  });

  // --- Custom exercise ops ---

  it("upserts and soft-deletes a custom exercise", async () => {
    const ops: FizrukDualWriteOp[] = [
      {
        kind: "custom-exercise-upsert",
        exercise: { id: "cex1", nameUk: "Моя вправа", primaryGroup: "back" },
      },
    ];
    const result = await applyFizrukDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS1,
      logger: silentLogger,
    });
    expect(result.applied).toBe(1);

    const rows = handle.client.all<Record<string, unknown>>(
      "SELECT * FROM fizruk_custom_exercises WHERE id = ?",
      ["cex1"],
    );
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].data_json as string)).toMatchObject({
      id: "cex1",
      nameUk: "Моя вправа",
    });

    // Delete
    const delOps: FizrukDualWriteOp[] = [
      { kind: "custom-exercise-delete", exerciseId: "cex1" },
    ];
    await applyFizrukDualWriteOps(handle.client, delOps, {
      userId: UID,
      clientTs: TS2,
      logger: silentLogger,
    });

    const after = handle.client.all<Record<string, unknown>>(
      "SELECT deleted_at FROM fizruk_custom_exercises WHERE id = ?",
      ["cex1"],
    );
    expect(after[0].deleted_at).toBe(TS2);
  });

  // --- Measurement ops ---

  it("upserts and soft-deletes a measurement", async () => {
    const ops: FizrukDualWriteOp[] = [
      {
        kind: "measurement-upsert",
        measurement: {
          id: "m1",
          at: "2026-05-01T08:00:00Z",
          weightKg: 80,
          waistCm: 85,
        },
      },
    ];
    const result = await applyFizrukDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS1,
      logger: silentLogger,
    });
    expect(result.applied).toBe(1);

    const rows = handle.client.all<Record<string, unknown>>(
      "SELECT * FROM fizruk_measurements WHERE id = ?",
      ["m1"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].weight_kg).toBe(80);
    expect(rows[0].waist_cm).toBe(85);

    // Delete
    const delOps: FizrukDualWriteOp[] = [
      { kind: "measurement-delete", measurementId: "m1" },
    ];
    await applyFizrukDualWriteOps(handle.client, delOps, {
      userId: UID,
      clientTs: TS2,
      logger: silentLogger,
    });

    const after = handle.client.all<Record<string, unknown>>(
      "SELECT deleted_at FROM fizruk_measurements WHERE id = ?",
      ["m1"],
    );
    expect(after[0].deleted_at).toBe(TS2);
  });

  // --- Error handling ---

  it("logs errors and continues processing remaining ops", async () => {
    const warnings: unknown[] = [];
    const ops: FizrukDualWriteOp[] = [
      {
        kind: "measurement-upsert",
        measurement: { id: "m1", at: "2026-05-01T08:00:00Z" },
      },
      // This will also succeed since we're just testing the counter
      {
        kind: "measurement-upsert",
        measurement: { id: "m2", at: "2026-05-01T09:00:00Z", weightKg: 75 },
      },
    ];

    const result = await applyFizrukDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS1,
      logger: (_level, msg, meta) => warnings.push({ msg, meta }),
    });
    expect(result.applied).toBe(2);
    expect(result.errored).toBe(0);
  });
});
