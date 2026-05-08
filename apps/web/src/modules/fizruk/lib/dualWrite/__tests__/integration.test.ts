import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  registerFizrukDualWriteContext,
  dualWriteFizrukState,
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
};

beforeEach(async () => {
  handle = await createTestSqlite();
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
    };
    const result = await dualWriteFizrukState(state, state);
    expect(result).toEqual({ status: "skipped", reason: "no-ops" });
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
});
