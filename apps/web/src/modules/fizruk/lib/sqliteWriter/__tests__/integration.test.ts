import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Patch enqueueOutboxUpsert so integration tests can assert the outbox
// enqueue shape without a real sync_op_outbox table in the test DB.
// The mock is hoisted via vi.mock so it intercepts the adapter import.
vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
import { enqueueOutboxUpsert } from "../../../../../core/syncEngine/enqueueOutboxUpsert.js";

import {
  registerFizrukDualWriteContext,
  dualWriteFizrukState,
  triggerFizrukDualWrite,
  __clearFizrukDualWriteContextForTests,
  type FizrukDualWriteContext,
  type FizrukDualWriteState,
} from "../index.js";
import { createTestSqlite, type TestSqliteHandle } from "./testSqlite.js";

let handle: TestSqliteHandle;
const UID = "user-1";
const TS = "2026-05-01T10:00:00.000Z";

const EMPTY: FizrukDualWriteState = {
  workouts: [],
  customExercises: [],
  measurements: [],
  dailyLog: [],
  monthlyPlan: null,
  workoutTemplates: [],
};

beforeEach(async () => {
  handle = await createTestSqlite();
  (enqueueOutboxUpsert as ReturnType<typeof vi.fn>).mockClear();
  (enqueueOutboxUpsert as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 1,
    inserted: true,
  });
});
afterEach(() => {
  __clearFizrukDualWriteContextForTests();
  handle.close();
});

function makeCtx(
  overrides: Partial<FizrukDualWriteContext> = {},
): FizrukDualWriteContext {
  return {
    getUserId: () => UID,
    getMigrationClient: async () => handle.client,
    getNow: () => TS,
    logger: () => {},
    ...overrides,
  };
}

describe("dualWriteFizrukState integration", () => {
  it("skips when context is not registered", async () => {
    const result = await dualWriteFizrukState(EMPTY, EMPTY);
    expect(result).toEqual({ status: "skipped", reason: "context-unset" });
  });

  it("skips when no ops (same state)", async () => {
    const teardown = registerFizrukDualWriteContext(makeCtx());
    const state: FizrukDualWriteState = {
      workouts: [],
      customExercises: [],
      measurements: [],
      dailyLog: [],
      monthlyPlan: null,
      workoutTemplates: [],
    };
    const result = await dualWriteFizrukState(state, state);
    expect(result).toEqual({ status: "skipped", reason: "no-ops" });
    teardown();
  });

  it("queues fire-and-forget trigger work when context is registered", async () => {
    const logger = vi.fn();
    const teardown = registerFizrukDualWriteContext(makeCtx({ logger }));

    triggerFizrukDualWrite(EMPTY, EMPTY);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 5));
    await Promise.resolve();

    expect(logger).not.toHaveBeenCalled();
    teardown();
  });

  it("skips when userId is null", async () => {
    const teardown = registerFizrukDualWriteContext(
      makeCtx({ getUserId: () => null }),
    );
    const next: FizrukDualWriteState = {
      ...EMPTY,
      measurements: [{ id: "m1", at: "2026-05-01T08:00:00Z", weightKg: 80 }],
    };
    const result = await dualWriteFizrukState(EMPTY, next);
    expect(result).toEqual({ status: "skipped", reason: "user-id-missing" });
    teardown();
  });

  it("skips when sqlite client returns null", async () => {
    const teardown = registerFizrukDualWriteContext(
      makeCtx({ getMigrationClient: async () => null }),
    );
    const next: FizrukDualWriteState = {
      ...EMPTY,
      measurements: [{ id: "m1", at: "2026-05-01T08:00:00Z", weightKg: 80 }],
    };
    const result = await dualWriteFizrukState(EMPTY, next);
    expect(result).toEqual({ status: "skipped", reason: "sqlite-unavailable" });
    teardown();
  });

  it("applies workout + measurement ops end-to-end", async () => {
    const teardown = registerFizrukDualWriteContext(makeCtx());

    const next: FizrukDualWriteState = {
      workouts: [
        {
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
      ],
      customExercises: [
        { id: "cex1", nameUk: "Моя вправа", primaryGroup: "back" },
      ],
      measurements: [{ id: "m1", at: "2026-05-01T08:00:00Z", weightKg: 80 }],
      dailyLog: [],
      monthlyPlan: null,
      workoutTemplates: [],
    };

    const result = await dualWriteFizrukState(EMPTY, next);
    expect(result.status).toBe("applied");
    if (result.status !== "applied") throw new Error("expected applied");
    expect(result.result.applied).toBe(3);
    expect(result.result.errored).toBe(0);

    // Verify rows in SQLite
    const workouts = handle.client.all<Record<string, unknown>>(
      "SELECT * FROM fizruk_workouts",
    );
    expect(workouts).toHaveLength(1);

    const items = handle.client.all<Record<string, unknown>>(
      "SELECT * FROM fizruk_workout_items",
    );
    expect(items).toHaveLength(1);

    const sets = handle.client.all<Record<string, unknown>>(
      "SELECT * FROM fizruk_workout_sets",
    );
    expect(sets).toHaveLength(1);

    const exercises = handle.client.all<Record<string, unknown>>(
      "SELECT * FROM fizruk_custom_exercises",
    );
    expect(exercises).toHaveLength(1);

    const measurements = handle.client.all<Record<string, unknown>>(
      "SELECT * FROM fizruk_measurements",
    );
    expect(measurements).toHaveLength(1);

    teardown();
  });

  it("teardown clears context", async () => {
    const teardown = registerFizrukDualWriteContext(makeCtx());
    teardown();
    const result = await dualWriteFizrukState(EMPTY, {
      ...EMPTY,
      measurements: [{ id: "m1", at: "2026-05-01T08:00:00Z", weightKg: 80 }],
    });
    expect(result).toEqual({ status: "skipped", reason: "context-unset" });
  });

  // Stage 12 / PR #070f-dualwrite — round-trip for new entity classes.
  it("applies daily-log + monthly-plan + workout-template ops end-to-end", async () => {
    const teardown = registerFizrukDualWriteContext(makeCtx());

    const next: FizrukDualWriteState = {
      ...EMPTY,
      dailyLog: [
        {
          id: "d1",
          at: "2026-05-01T07:00:00Z",
          weightKg: 80,
          sleepHours: 7,
          energyLevel: 6,
          mood: 4,
          note: "ok",
        },
      ],
      monthlyPlan: { dataJson: '{"days":{"2026-05-01":[]}}' },
      workoutTemplates: [
        {
          id: "t1",
          name: "Push day",
          exerciseIds: ["bench-press"],
          groups: [],
          updatedAt: TS,
          lastUsedAt: null,
        },
      ],
    };

    const result = await dualWriteFizrukState(EMPTY, next);
    expect(result.status).toBe("applied");
    if (result.status !== "applied") throw new Error("expected applied");
    expect(result.result.applied).toBe(3);
    expect(result.result.errored).toBe(0);

    const dailyLog = await handle.client.all<Record<string, unknown>>(
      "SELECT id, entry_at, weight_kg, mood FROM fizruk_daily_log",
    );
    expect(dailyLog).toHaveLength(1);
    expect(dailyLog[0]!["id"]).toBe("d1");
    expect(dailyLog[0]!["entry_at"]).toBe("2026-05-01T07:00:00Z");
    expect(dailyLog[0]!["weight_kg"]).toBe(80);
    expect(dailyLog[0]!["mood"]).toBe(4);

    const plan = await handle.client.all<Record<string, unknown>>(
      "SELECT user_id, data_json FROM fizruk_monthly_plan",
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]!["user_id"]).toBe(UID);
    expect(plan[0]!["data_json"]).toBe('{"days":{"2026-05-01":[]}}');

    const templates = await handle.client.all<Record<string, unknown>>(
      "SELECT id, name, exercise_ids_json FROM fizruk_workout_templates",
    );
    expect(templates).toHaveLength(1);
    expect(templates[0]!["id"]).toBe("t1");
    expect(templates[0]!["name"]).toBe("Push day");
    expect(JSON.parse(templates[0]!["exercise_ids_json"] as string)).toEqual([
      "bench-press",
    ]);

    teardown();
  });
});

describe("dualWriteFizrukState — outbox enqueue wiring", () => {
  const enqueueMock = enqueueOutboxUpsert as ReturnType<typeof vi.fn>;

  it("enqueues a fizruk_workouts insert op after workout-upsert", async () => {
    const teardown = registerFizrukDualWriteContext(makeCtx());
    const next: FizrukDualWriteState = {
      ...EMPTY,
      workouts: [
        {
          id: "w1",
          startedAt: "2026-05-01T10:00:00Z",
          endedAt: null,
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "test",
        },
      ],
    };

    await dualWriteFizrukState(EMPTY, next);
    await Promise.resolve();
    await Promise.resolve();

    const workoutCalls = enqueueMock.mock.calls.filter(
      ([, input]) => input.table === "fizruk_workouts",
    );
    expect(workoutCalls.length).toBeGreaterThanOrEqual(1);
    const [, input] = workoutCalls[0]!;
    expect(input.table).toBe("fizruk_workouts");
    expect(input.op).toBe("insert");
    expect(input.row).toMatchObject({
      id: "w1",
      user_id: UID,
      note: "test",
    });
    expect(typeof input.idempotencyKey).toBe("string");

    teardown();
  });

  it("enqueues fizruk_workout_items and fizruk_workout_sets inserts alongside the workout", async () => {
    const teardown = registerFizrukDualWriteContext(makeCtx());
    const next: FizrukDualWriteState = {
      ...EMPTY,
      workouts: [
        {
          id: "w1",
          startedAt: "2026-05-01T10:00:00Z",
          endedAt: null,
          items: [
            {
              id: "i1",
              exerciseId: "bench",
              nameUk: "Жим лежачи",
              primaryGroup: "chest",
              musclesPrimary: [],
              musclesSecondary: [],
              type: "strength",
              sets: [{ weightKg: 80, reps: 8 }],
            },
          ],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "",
        },
      ],
    };

    await dualWriteFizrukState(EMPTY, next);
    await Promise.resolve();
    await Promise.resolve();

    const tables = enqueueMock.mock.calls.map(([, i]) => i.table);
    expect(tables).toContain("fizruk_workouts");
    expect(tables).toContain("fizruk_workout_items");
    expect(tables).toContain("fizruk_workout_sets");

    teardown();
  });

  it("enqueues fizruk_workouts + items + sets deletes on workout-delete", async () => {
    // Seed the workout first so cascade-delete has rows to find.
    const teardown = registerFizrukDualWriteContext(makeCtx());
    const withWorkout: FizrukDualWriteState = {
      ...EMPTY,
      workouts: [
        {
          id: "w1",
          startedAt: "2026-05-01T10:00:00Z",
          endedAt: null,
          items: [
            {
              id: "i1",
              exerciseId: "squat",
              nameUk: "Присідання",
              primaryGroup: "legs",
              musclesPrimary: [],
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
      ],
    };
    await dualWriteFizrukState(EMPTY, withWorkout);
    enqueueMock.mockClear();

    // Now delete the workout.
    await dualWriteFizrukState(withWorkout, EMPTY);
    await Promise.resolve();
    await Promise.resolve();

    const deleteCalls = enqueueMock.mock.calls.filter(
      ([, i]) => i.op === "delete",
    );
    const deletedTables = deleteCalls.map(([, i]) => i.table);
    expect(deletedTables).toContain("fizruk_workouts");
    expect(deletedTables).toContain("fizruk_workout_items");
    expect(deletedTables).toContain("fizruk_workout_sets");

    teardown();
  });

  it("enqueues fizruk_custom_exercises insert and delete ops", async () => {
    const teardown = registerFizrukDualWriteContext(makeCtx());
    const withExercise: FizrukDualWriteState = {
      ...EMPTY,
      customExercises: [
        { id: "cex1", nameUk: "Моя вправа", primaryGroup: "back" },
      ],
    };

    await dualWriteFizrukState(EMPTY, withExercise);
    await Promise.resolve();
    await Promise.resolve();

    const insertCall = enqueueMock.mock.calls.find(
      ([, i]) => i.table === "fizruk_custom_exercises" && i.op === "insert",
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1].row).toMatchObject({
      id: "cex1",
      user_id: UID,
    });

    // Delete
    enqueueMock.mockClear();
    await dualWriteFizrukState(withExercise, EMPTY);
    await Promise.resolve();
    await Promise.resolve();

    const deleteCall = enqueueMock.mock.calls.find(
      ([, i]) => i.table === "fizruk_custom_exercises" && i.op === "delete",
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall![1].row).toMatchObject({ id: "cex1", user_id: UID });

    teardown();
  });

  it("enqueues fizruk_measurements insert and delete ops", async () => {
    const teardown = registerFizrukDualWriteContext(makeCtx());
    const withMeasurement: FizrukDualWriteState = {
      ...EMPTY,
      measurements: [
        { id: "m1", at: "2026-05-01T08:00:00Z", weightKg: 80, waistCm: 85 },
      ],
    };

    await dualWriteFizrukState(EMPTY, withMeasurement);
    await Promise.resolve();
    await Promise.resolve();

    const insertCall = enqueueMock.mock.calls.find(
      ([, i]) => i.table === "fizruk_measurements" && i.op === "insert",
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1].row).toMatchObject({
      id: "m1",
      user_id: UID,
      measured_at: "2026-05-01T08:00:00Z",
      weight_kg: 80,
      waist_cm: 85,
    });

    // Delete
    enqueueMock.mockClear();
    await dualWriteFizrukState(withMeasurement, EMPTY);
    await Promise.resolve();
    await Promise.resolve();

    const deleteCall = enqueueMock.mock.calls.find(
      ([, i]) => i.table === "fizruk_measurements" && i.op === "delete",
    );
    expect(deleteCall).toBeDefined();

    teardown();
  });

  it("does NOT reject dualWrite when enqueueOutboxUpsert throws (fire-and-forget)", async () => {
    enqueueMock.mockRejectedValue(new Error("disk full"));
    const teardown = registerFizrukDualWriteContext(makeCtx());
    const next: FizrukDualWriteState = {
      ...EMPTY,
      measurements: [{ id: "m1", at: "2026-05-01T08:00:00Z", weightKg: 80 }],
    };

    // Must resolve — local write is unaffected even when enqueue throws.
    const result = await dualWriteFizrukState(EMPTY, next);
    expect(result.status).toBe("applied");

    // Row was still written to SQLite.
    const rows = handle.client.all<Record<string, unknown>>(
      "SELECT id FROM fizruk_measurements",
    );
    expect(rows).toHaveLength(1);

    teardown();
  });

  it("enqueues stage-12 local tables (daily-log, monthly-plan, workout-template)", async () => {
    const teardown = registerFizrukDualWriteContext(makeCtx());
    const next: FizrukDualWriteState = {
      ...EMPTY,
      dailyLog: [
        {
          id: "d1",
          at: "2026-05-01T07:00:00Z",
          weightKg: 80,
          sleepHours: null,
          energyLevel: null,
          mood: null,
          note: "",
        },
      ],
      monthlyPlan: { dataJson: '{"days":{}}' },
      workoutTemplates: [
        {
          id: "t1",
          name: "Push",
          exerciseIds: [],
          groups: [],
          updatedAt: TS,
          lastUsedAt: null,
        },
      ],
    };

    await dualWriteFizrukState(EMPTY, next);
    await Promise.resolve();
    await Promise.resolve();

    const stage12Calls = enqueueMock.mock.calls.filter(([, i]) =>
      [
        "fizruk_daily_log",
        "fizruk_monthly_plan",
        "fizruk_workout_templates",
      ].includes(i.table),
    );
    expect(stage12Calls.map(([, i]) => [i.table, i.op])).toEqual([
      ["fizruk_daily_log", "insert"],
      ["fizruk_monthly_plan", "insert"],
      ["fizruk_workout_templates", "insert"],
    ]);

    teardown();
  });
});
