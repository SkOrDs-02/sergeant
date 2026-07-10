import {
  createApplyOps,
  type ApplyDualWriteOptions as CoreApplyDualWriteOptions,
  type ApplyDualWriteResult as CoreApplyDualWriteResult,
  type DualWriteLogger as CoreDualWriteLogger,
} from "@sergeant/dualwrite-core";
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
 * `apps/web/src/modules/fizruk/lib/sqliteWriter/adapter.ts` — see the
 * web copy for the full design notes (best-effort, idempotency,
 * LWW guard).
 *
 * **ADR-0073 крок 9** — migrated onto `@sergeant/dualwrite-core`: the
 * op-loop is now `createApplyOps` (`errorPolicy: "best-effort"`, as-is —
 * this pipeline was never transactional, unlike former web-fizruk) and
 * every SQL op-kind's table SQL is emitted by the shared `buildLwwUpsert` /
 * `buildDelete` / `buildReconcileChildren` builders in each op-family
 * companion file. The mobile-only op-kinds (`programs-set`,
 * `plan-template-set`, `wellbeing-upsert`/`-delete`) are plain singleton /
 * composite-PK table upserts, so they migrate through the same builders.
 * `active-workout-set` is the one exception: it writes to the shared
 * `kv_store` table, not a `fizruk_*` table, so it stays a hand-written
 * handler in `activeWorkout.ts` (ADR-0073 § "Що ми свідомо НЕ
 * абстрагуємо" п.7) — builders don't model its INTEGER-epoch LWW guard.
 * Behaviour and emitted `(sql, params)` sequence — including the KV call —
 * are byte-identical to the previous hand-written adapter, per
 * `adapter.snapshot.test.ts`.
 *
 * **ADR-0073 Open question #7** — the default logger is now injected
 * (`options.logger ?? DEFAULT_LOGGER`) instead of a bare `console.warn`
 * call, matching every other migrated pipeline. The logger is not part of
 * the `(sql, params)` sequence, so the snapshot gate is unaffected.
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
 *   - activeWorkout.ts    — active-workout-set (KV, manual handler)
 */

export type ApplyDualWriteOptions = CoreApplyDualWriteOptions;
export type DualWriteLogger = CoreDualWriteLogger;
export type ApplyDualWriteResult = CoreApplyDualWriteResult;

const DEFAULT_LOGGER: DualWriteLogger = (level, message, meta) => {
  if (level === "warn") {
    console.warn(`[fizruk.dualWrite] ${message}`, meta ?? {});
  }
};

const applyOps = createApplyOps<FizrukDualWriteOp>({
  errorPolicy: "best-effort",
  handlers: {
    "workout-upsert": async (client, op, rt) => {
      await upsertWorkout(client, op.workout, rt);
      return "applied";
    },
    "workout-delete": async (client, op, rt) => {
      await softDeleteWorkout(client, op.workoutId, rt);
      return "applied";
    },
    "custom-exercise-upsert": async (client, op, rt) => {
      await upsertCustomExercise(client, op.exercise, rt);
      return "applied";
    },
    "custom-exercise-delete": async (client, op, rt) => {
      await softDeleteCustomExercise(client, op.exerciseId, rt);
      return "applied";
    },
    "measurement-upsert": async (client, op, rt) => {
      await upsertMeasurement(client, op.measurement, rt);
      return "applied";
    },
    "measurement-delete": async (client, op, rt) => {
      await softDeleteMeasurement(client, op.measurementId, rt);
      return "applied";
    },
    "daily-log-upsert": async (client, op, rt) => {
      await upsertDailyLog(client, op.entry, rt);
      return "applied";
    },
    "daily-log-delete": async (client, op, rt) => {
      await softDeleteDailyLog(client, op.entryId, rt);
      return "applied";
    },
    "monthly-plan-set": async (client, op, rt) => {
      await setMonthlyPlan(client, op.monthlyPlan, rt);
      return "applied";
    },
    "workout-template-upsert": async (client, op, rt) => {
      await upsertWorkoutTemplate(client, op.template, rt);
      return "applied";
    },
    "workout-template-delete": async (client, op, rt) => {
      await softDeleteWorkoutTemplate(client, op.templateId, rt);
      return "applied";
    },
    "programs-set": async (client, op, rt) => {
      await setPrograms(client, op.programs, rt);
      return "applied";
    },
    "plan-template-set": async (client, op, rt) => {
      await setPlanTemplate(client, op.planTemplate, rt);
      return "applied";
    },
    "wellbeing-upsert": async (client, op, rt) => {
      await upsertWellbeing(client, op.entry, rt);
      return "applied";
    },
    "wellbeing-delete": async (client, op, rt) => {
      await softDeleteWellbeing(client, op.dateKey, rt);
      return "applied";
    },
    "active-workout-set": async (client, op, rt) => {
      await setActiveWorkout(client, op.activeWorkout, rt);
      return "applied";
    },
  },
});

export async function applyFizrukDualWriteOps(
  client: SqliteMigrationClient,
  ops: readonly FizrukDualWriteOp[],
  options: ApplyDualWriteOptions,
): Promise<ApplyDualWriteResult> {
  return applyOps(client, ops, {
    userId: options.userId,
    clientTs: options.clientTs,
    logger: options.logger ?? DEFAULT_LOGGER,
  });
}
