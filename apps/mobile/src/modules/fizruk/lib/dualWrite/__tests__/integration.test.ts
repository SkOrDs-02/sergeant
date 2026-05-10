/**
 * Integration test for the mobile Fizruk dual-write orchestrator.
 *
 * Stage 12 / PR #070f-mobile-dualwrite — mirrors the routine
 * orchestrator integration test but exercises the new entity
 * classes (daily-log, monthly-plan, workout-templates) end-to-end:
 * register context → diff → apply → parity probe → telemetry.
 */
import Database from "better-sqlite3";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import {
  __peekDualWriteTelemetryForTests,
  __resetDualWriteTelemetryForTests,
} from "../../../../../lib/observability/dualWriteTelemetry";
import { migrateFizruk } from "../../clientMigrate";
import type { FizrukDualWriteState } from "../diff";
import {
  __clearFizrukDualWriteContextForTests,
  dualWriteFizrukState,
  registerFizrukDualWriteContext,
  type FizrukDualWriteContext,
} from "../index";

function syncClient(db: ReturnType<typeof Database>): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...((params ?? []) as unknown[]));
    },
    all<R extends Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): R[] {
      const stmt = db.prepare(sql);
      const result = params ? stmt.all(...(params as unknown[])) : stmt.all();
      return result as R[];
    },
  };
}

const UID = "user-1";
const TS1 = "2026-05-01T10:00:00.000Z";

const EMPTY: FizrukDualWriteState = {
  workouts: [],
  customExercises: [],
  measurements: [],
  dailyLog: [],
  monthlyPlan: null,
  workoutTemplates: [],
  programs: null,
  planTemplate: null,
  wellbeing: [],
  activeWorkout: null,
};

/**
 * Stage 12.5 / PR #070f3-active-workout-dualwrite — the active-workout
 * op writes to the shared `kv_store` table (per-device, no `user_id`
 * scope). `migrateFizruk()` does not install `kv_store`, so the test
 * harness pre-creates it to mirror the production boot sequence
 * (`bootstrapMobileKvStore` runs before any dual-write op).
 */
const KV_STORE_INIT_SQL = `
  CREATE TABLE IF NOT EXISTS kv_store (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

describe("dualWriteFizrukState orchestrator (mobile, Stage 12)", () => {
  let db: ReturnType<typeof Database>;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = syncClient(db);
    await migrateFizruk(client);
    db.exec(KV_STORE_INIT_SQL);
    __resetDualWriteTelemetryForTests();
  });

  afterEach(() => {
    __clearFizrukDualWriteContextForTests();
    db.close();
  });

  function makeContext(
    overrides: Partial<FizrukDualWriteContext> = {},
  ): FizrukDualWriteContext {
    return {
      getUserId: () => UID,
      getMigrationClient: async () => client,
      getNow: () => TS1,
      logger: () => {},
      ...overrides,
    };
  }

  it("returns context-unset when nothing is registered", async () => {
    const next: FizrukDualWriteState = {
      ...EMPTY,
      monthlyPlan: { dataJson: "{}" },
    };
    expect(await dualWriteFizrukState(EMPTY, next)).toEqual({
      status: "skipped",
      reason: "context-unset",
    });
  });

  it("returns user-id-missing when getUserId() returns null", async () => {
    registerFizrukDualWriteContext(makeContext({ getUserId: () => null }));
    const next: FizrukDualWriteState = {
      ...EMPTY,
      monthlyPlan: { dataJson: "{}" },
    };
    expect(await dualWriteFizrukState(EMPTY, next)).toEqual({
      status: "skipped",
      reason: "user-id-missing",
    });
  });

  it("returns sqlite-unavailable on rejected getMigrationClient", async () => {
    registerFizrukDualWriteContext(
      makeContext({
        getMigrationClient: async () => {
          throw new Error("opfs unavailable");
        },
      }),
    );
    const next: FizrukDualWriteState = {
      ...EMPTY,
      monthlyPlan: { dataJson: "{}" },
    };
    expect(await dualWriteFizrukState(EMPTY, next)).toEqual({
      status: "skipped",
      reason: "sqlite-unavailable",
    });
  });

  it("applies Stage 12 ops end-to-end and ticks parity match", async () => {
    registerFizrukDualWriteContext(makeContext());
    const next: FizrukDualWriteState = {
      ...EMPTY,
      dailyLog: [
        {
          id: "d1",
          at: "2026-05-01T07:00:00Z",
          weightKg: 80,
          sleepHours: 7,
          energyLevel: 6,
          mood: 5,
          note: "",
        },
      ],
      monthlyPlan: { dataJson: '{"days":{}}' },
      workoutTemplates: [
        {
          id: "t1",
          name: "Push",
          exerciseIds: ["bench-press"],
          groups: [],
          updatedAt: TS1,
        },
      ],
    };
    const outcome = await dualWriteFizrukState(EMPTY, next);
    expect(outcome.status).toBe("applied");
    if (outcome.status === "applied") {
      expect(outcome.result.applied).toBe(3);
      expect(outcome.result.errored).toBe(0);
    }

    // Telemetry: applied + parity match recorded.
    const telemetry = __peekDualWriteTelemetryForTests("fizruk");
    expect(telemetry.applied).toBe(1);
    expect(telemetry.parityMatch).toBe(1);
    expect(telemetry.parityMismatch).toBe(0);
  });

  it("ticks parity mismatch when SQLite diverges from LS", async () => {
    registerFizrukDualWriteContext(makeContext());
    // Apply only the daily-log op so SQLite ends up with d1; LS-side
    // `next` will claim d2 instead → mismatch.
    const apply: FizrukDualWriteState = {
      ...EMPTY,
      dailyLog: [
        {
          id: "d1",
          at: "2026-05-01T07:00:00Z",
          weightKg: null,
          sleepHours: null,
          energyLevel: null,
          mood: null,
          note: "",
        },
      ],
    };
    await dualWriteFizrukState(EMPTY, apply);

    __resetDualWriteTelemetryForTests();

    const liedNext: FizrukDualWriteState = {
      ...EMPTY,
      dailyLog: [
        {
          id: "d2",
          at: "2026-05-02T07:00:00Z",
          weightKg: null,
          sleepHours: null,
          energyLevel: null,
          mood: null,
          note: "",
        },
      ],
    };
    await dualWriteFizrukState(apply, liedNext);

    const telemetry = __peekDualWriteTelemetryForTests("fizruk");
    expect(telemetry.parityMismatch).toBeGreaterThanOrEqual(1);
  });

  // --- Stage 12.5 -----------------------------------------------------

  it("applies Stage 12.5 ops end-to-end and ticks parity match", async () => {
    registerFizrukDualWriteContext(makeContext());
    const next: FizrukDualWriteState = {
      ...EMPTY,
      programs: { activeProgramId: "prog-1" },
      planTemplate: { dataJson: '{"id":"t1"}' },
      wellbeing: [
        {
          dateKey: "2026-05-01",
          mood: 4,
          energy: 4,
          sleepQuality: 4,
          sleepHours: 7.5,
          notes: "",
          updatedAt: TS1,
        },
      ],
    };
    const outcome = await dualWriteFizrukState(EMPTY, next);
    expect(outcome.status).toBe("applied");
    if (outcome.status === "applied") {
      expect(outcome.result.applied).toBe(3);
      expect(outcome.result.errored).toBe(0);
    }

    const telemetry = __peekDualWriteTelemetryForTests("fizruk");
    expect(telemetry.applied).toBe(1);
    expect(telemetry.parityMatch).toBe(1);
    expect(telemetry.parityMismatch).toBe(0);
  });

  // --- Stage 12.5 / PR #070f3 — active-workout end-to-end ---------

  it("applies an active-workout-set op end-to-end and writes to kv_store", async () => {
    registerFizrukDualWriteContext(makeContext());
    const next: FizrukDualWriteState = {
      ...EMPTY,
      activeWorkout: { activeWorkoutId: "w-1" },
    };
    const outcome = await dualWriteFizrukState(EMPTY, next);
    expect(outcome.status).toBe("applied");
    if (outcome.status === "applied") {
      expect(outcome.result.applied).toBe(1);
      expect(outcome.result.errored).toBe(0);
    }

    const rows = client.all<Record<string, unknown>>(
      "SELECT value FROM kv_store WHERE key = ?",
      ["fizruk_active_workout_id_v1"],
    ) as unknown as Record<string, unknown>[];
    expect(rows[0]!.value).toBe('"w-1"');

    const telemetry = __peekDualWriteTelemetryForTests("fizruk");
    expect(telemetry.parityMatch).toBeGreaterThanOrEqual(1);
    expect(telemetry.parityMismatch).toBe(0);
  });
});
