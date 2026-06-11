/**
 * Last validated: 2026-06-11
 * Status: Active
 */
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { logger } from "@shared/lib";
import type { FizrukDualWriteOp } from "./diff/index.js";

import {
  upsertWorkout,
  softDeleteWorkout,
  upsertCustomExercise,
  softDeleteCustomExercise,
  upsertMeasurement,
  softDeleteMeasurement,
  upsertDailyLog,
  softDeleteDailyLog,
  setMonthlyPlan,
  upsertWorkoutTemplate,
  softDeleteWorkoutTemplate,
} from "./ops/index.js";

// Types re-exported for backward compatibility
export type {
  ApplyDualWriteOptions,
  DualWriteLogger,
  ApplyDualWriteResult,
} from "@shared/lib/dualWrite/core";

const DEFAULT_LOGGER = (
  level: "warn" | "info",
  message: string,
  meta?: Record<string, unknown>,
) => {
  if (level === "warn") {
    logger.warn(`[fizruk.dualWrite] ${message}`, meta ?? {});
  }
};

export async function applyFizrukDualWriteOps(
  client: SqliteMigrationClient,
  ops: readonly FizrukDualWriteOp[],
  options: {
    readonly userId: string;
    readonly clientTs: string;
    readonly logger?:
      | ((
          level: "warn" | "info",
          message: string,
          meta?: Record<string, unknown>,
        ) => void)
      | undefined;
  },
): Promise<{ applied: number; errored: number; skipped: number }> {
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
  options: { userId: string; clientTs: string },
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
    default: {
      const _exhaustive: never = op;
      void _exhaustive;
      return "skipped";
    }
  }
}
