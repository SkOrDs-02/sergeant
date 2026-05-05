/**
 * Unit tests for the fizruk SQLite read path (PR #029).
 *
 * Uses the same `createTestSqlite` helper as the fizruk dual-write
 * adapter tests (in-memory `better-sqlite3` with the fizruk client
 * migrations applied), then exercises `refreshFizrukSqliteState` /
 * `getCachedFizrukSqliteState` end-to-end against realistic row shapes.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { applyFizrukDualWriteOps } from "./dualWrite/adapter";
import type { FizrukDualWriteOp } from "./dualWrite/diff";
import {
  clearFizrukSqliteCache,
  getCachedFizrukSqliteState,
  refreshFizrukSqliteState,
} from "./sqliteReader";
import {
  createTestSqlite,
  type TestSqliteHandle,
} from "./dualWrite/__tests__/testSqlite";

const UID = "user-1";
const TS = "2026-05-01T10:00:00.000Z";

let handle: TestSqliteHandle;

beforeEach(async () => {
  handle = await createTestSqlite();
  clearFizrukSqliteCache();
});
afterEach(() => handle.close());

const silentLogger = () => {};

describe("refreshFizrukSqliteState", () => {
  it("returns empty cache for a fresh DB and stamps refreshedAt", async () => {
    const cache = await refreshFizrukSqliteState(handle.client, UID);
    expect(cache.workouts).toEqual([]);
    expect(cache.customExercises).toEqual([]);
    expect(cache.measurements).toEqual([]);
    expect(cache.refreshedAt).not.toBeNull();
  });

  it("hydrates workouts with items and sets in deterministic order", async () => {
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
    await applyFizrukDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS,
      logger: silentLogger,
    });

    const cache = await refreshFizrukSqliteState(handle.client, UID);
    expect(cache.workouts).toHaveLength(1);
    const w = cache.workouts[0];
    expect(w!.id!).toBe("w1");
    expect(w!.note!).toBe("morning session");
    expect(w!.items!).toHaveLength(1);
    const item = w!.items[0]!;
    expect(item.id!).toBe("i1");
    expect(item.exerciseId!).toBe("bench-press");
    expect(item.nameUk!).toBe("Жим лежачи");
    expect(item.musclesPrimary!).toEqual(["chest"]);
    expect(item.sets!).toEqual([
      { weightKg: 80, reps: 8 },
      { weightKg: 85, reps: 6, rpe: 8 },
    ]);
  });

  it("filters out other users' rows", async () => {
    const otherOps: FizrukDualWriteOp[] = [
      {
        kind: "workout-upsert",
        workout: {
          id: "w-other",
          startedAt: "2026-05-01T10:00:00Z",
          endedAt: null,
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "",
        },
      },
    ];
    await applyFizrukDualWriteOps(handle.client, otherOps, {
      userId: "user-2",
      clientTs: TS,
      logger: silentLogger,
    });

    const cache = await refreshFizrukSqliteState(handle.client, UID);
    expect(cache.workouts).toEqual([]);
  });

  it("excludes soft-deleted workouts and items", async () => {
    const ops: FizrukDualWriteOp[] = [
      {
        kind: "workout-upsert",
        workout: {
          id: "w-keep",
          startedAt: "2026-05-01T10:00:00Z",
          endedAt: null,
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "keep",
        },
      },
      {
        kind: "workout-upsert",
        workout: {
          id: "w-del",
          startedAt: "2026-05-01T11:00:00Z",
          endedAt: null,
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "delete me",
        },
      },
    ];
    await applyFizrukDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS,
      logger: silentLogger,
    });
    await applyFizrukDualWriteOps(
      handle.client,
      [{ kind: "workout-delete", workoutId: "w-del" }],
      {
        userId: UID,
        clientTs: "2026-05-01T12:00:00.000Z",
        logger: silentLogger,
      },
    );

    const cache = await refreshFizrukSqliteState(handle.client, UID);
    expect(cache.workouts.map((w) => w.id)).toEqual(["w-keep"]);
  });

  it("hydrates custom exercises and measurements", async () => {
    const ops: FizrukDualWriteOp[] = [
      {
        kind: "custom-exercise-upsert",
        exercise: {
          id: "ex-custom-1",
          nameUk: "Своя вправа",
          primaryGroup: "back",
          musclesPrimary: ["back"],
          musclesSecondary: [],
          type: "strength",
        },
      },
      {
        kind: "measurement-upsert",
        measurement: {
          id: "m-1",
          at: "2026-05-01T08:00:00.000Z",
          weightKg: 80.4,
          waistCm: 82,
        },
      },
    ];
    await applyFizrukDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS,
      logger: silentLogger,
    });

    const cache = await refreshFizrukSqliteState(handle.client, UID);
    expect(cache.customExercises).toHaveLength(1);
    expect(cache.customExercises[0]!.id).toBe("ex-custom-1");
    expect(cache.measurements).toHaveLength(1);
    expect(cache.measurements[0]!.id).toBe("m-1");
  });
});

describe("getCachedFizrukSqliteState", () => {
  it("returns the empty cache before any refresh", () => {
    const cache = getCachedFizrukSqliteState();
    expect(cache.refreshedAt).toBeNull();
    expect(cache.workouts).toEqual([]);
  });

  it("returns the most recent refreshed cache after refresh", async () => {
    const ops: FizrukDualWriteOp[] = [
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
          note: "",
        },
      },
    ];
    await applyFizrukDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS,
      logger: silentLogger,
    });
    await refreshFizrukSqliteState(handle.client, UID);

    const cache = getCachedFizrukSqliteState();
    expect(cache.refreshedAt).not.toBeNull();
    expect(cache.workouts).toHaveLength(1);
  });
});
