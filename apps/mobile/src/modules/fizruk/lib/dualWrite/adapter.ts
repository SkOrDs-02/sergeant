import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type { FizrukDualWriteOp } from "./diff";

import { setActiveWorkout } from "./activeWorkout";
import {
  upsertCustomExercise,
  softDeleteCustomExercise,
} from "./customExercises";
import { upsertDailyLog, softDeleteDailyLog } from "./dailyLog";
import { upsertMeasurement, softDeleteMeasurement } from "./measurements";
import { setPrograms, setPlanTemplate } from "./programs";
import {
  setMonthlyPlan,
  upsertWorkoutTemplate,
  softDeleteWorkoutTemplate,
} from "./templates";
import { upsertWellbeing, softDeleteWellbeing } from "./wellbeing";
import { upsertWorkout, softDeleteWorkout } from "./workouts";

export { ACTIVE_WORKOUT_KV_KEY } from "./activeWorkout";

/**
 * Async SQLite-side adapter for the Fizruk dual-write layer.
 *
 * Stage 4 PR #028 of `docs/planning/storage-roadmap.md`. Mirrors
 * `apps/web/src/modules/fizruk/lib/dualWrite/adapter.ts` — see the
 * web copy for the full design notes (best-effort, idempotency,
 * LWW guard).
 *
 * **Stage 12 / PR #070f-mobile-dualwrite** — extends mobile to
 * cover daily-log / monthly-plan / workout-template ops in parity
 * with web PR #070f-dualwrite. Each new op uses the same SQL surface
 * the web adapter ships, so unit-tests run unchanged on
 * `better-sqlite3`.
 *
 * Both copies use the same `SqliteMigrationClient` (`{exec, run, all}`)
 * shape so a single SQL surface serves both web (sqlite-wasm) and
 * mobile (expo-sqlite), and unit-tests run unchanged on `better-sqlite3`.
 *
 * The per-family implementation files live alongside this orchestrator:
 *   - workouts.ts         — workout-upsert / workout-delete
 *   - customExercises.ts  — custom-exercise-upsert / custom-exercise-delete
 *   - measurements.ts     — measurement-upsert / measurement-delete
 *   - dailyLog.ts         — daily-log-upsert / daily-log-delete
 *   - templates.ts        — monthly-plan-set / workout-template-upsert / workout-template-delete
 *   - programs.ts         — programs-set / plan-template-set
 *   - wellbeing.ts        — wellbeing-upsert / wellbeing-delete
 *   - activeWorkout.ts    — active-workout-set
 */

export interface ApplyDualWriteOptions {
  readonly userId: string;
  readonly clientTs: string;
  readonly logger?: DualWriteLogger;
}

export type DualWriteLogger = (
  level: "warn" | "info",
  message: string,
  meta?: Record<string, unknown>,
) => void;

export interface ApplyDualWriteResult {
  readonly applied: number;
  readonly errored: number;
  readonly skipped: number;
}

const DEFAULT_LOGGER: DualWriteLogger = (level, message, meta) => {
  if (level === "warn") {
    console.warn(`[fizruk.dualWrite] ${message}`, meta ?? {});
  }
};

export async function applyFizrukDualWriteOps(
  client: SqliteMigrationClient,
  ops: readonly FizrukDualWriteOp[],
  options: ApplyDualWriteOptions,
): Promise<ApplyDualWriteResult> {
  if (ops.length === 0) {
    return { applied: 0, errored: 0, skipped: 0 };
  }
  const logger = options.logger ?? DEFAULT_LOGGER;
  let applied = 0;
  let errored = 0;
  let skipped = 0;

  for (const op of ops) {
    try {
      const outcome = await applyOne(client, op, options);
      if (outcome === "applied") applied += 1;
      else skipped += 1;
    } catch (err) {
      errored += 1;
      logger("warn", "dual-write op failed", {
        op: op.kind,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { applied, errored, skipped };
}

type ApplyOutcome = "applied" | "skipped";

async function applyOne(
  client: SqliteMigrationClient,
  op: FizrukDualWriteOp,
  options: ApplyDualWriteOptions,
): Promise<ApplyOutcome> {
  const { userId, clientTs } = options;
  switch (op.kind) {
    case "workout-upsert":
      await upsertWorkout(client, op.workout, userId, clientTs);
      return "applied";

    case "workout-delete":
      await softDeleteWorkout(client, op.workoutId, userId, clientTs);
      return "applied";

    case "custom-exercise-upsert":
      await upsertCustomExercise(client, op.exercise, userId, clientTs);
      return "applied";

    case "custom-exercise-delete":
      await softDeleteCustomExercise(client, op.exerciseId, userId, clientTs);
      return "applied";

    case "measurement-upsert":
      await upsertMeasurement(client, op.measurement, userId, clientTs);
      return "applied";

    case "measurement-delete":
      await softDeleteMeasurement(client, op.measurementId, userId, clientTs);
      return "applied";

    // Stage 12 / PR #070f-mobile-dualwrite ops -----------------------
    case "daily-log-upsert":
      await upsertDailyLog(client, op.entry, userId, clientTs);
      return "applied";

    case "daily-log-delete":
      await softDeleteDailyLog(client, op.entryId, userId, clientTs);
      return "applied";

    case "monthly-plan-set":
      await setMonthlyPlan(client, op.monthlyPlan, userId, clientTs);
      return "applied";

    case "workout-template-upsert":
      await upsertWorkoutTemplate(client, op.template, userId, clientTs);
      return "applied";

    case "workout-template-delete":
      await softDeleteWorkoutTemplate(client, op.templateId, userId, clientTs);
      return "applied";

    // Stage 12.5 / PR #070f2-mobile-dualwrite ops --------------------
    case "programs-set":
      await setPrograms(client, op.programs, userId, clientTs);
      return "applied";

    case "plan-template-set":
      await setPlanTemplate(client, op.planTemplate, userId, clientTs);
      return "applied";

    case "wellbeing-upsert":
      await upsertWellbeing(client, op.entry, userId, clientTs);
      return "applied";

    case "wellbeing-delete":
      await softDeleteWellbeing(client, op.dateKey, userId, clientTs);
      return "applied";

    // Stage 12.5 / PR #070f3-active-workout-dualwrite ---------------
    case "active-workout-set":
      await setActiveWorkout(client, op.activeWorkout, clientTs);
      return "applied";

    default: {
      const _exhaustive: never = op;
      void _exhaustive;
      return "skipped";
    }
  }
}
