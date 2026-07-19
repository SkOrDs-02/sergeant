import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import pool from "../../db.js";
import { parseBody, parseQuery } from "../../http/validate.js";
import {
  SyncV2PullSchema,
  SyncV2PushSchema,
  type SyncV2Op,
} from "../../http/schemas.js";
import { logger } from "../../obs/logger.js";
import {
  syncOpLogApplyTotal,
  syncOpLogNullOriginDeviceIdTotal,
  syncOpLogPullLagMs,
  syncOpLogPullQueueDepth,
} from "../../obs/metrics.js";
import { notifySyncV2OpsApplied, type SyncV2StreamOp } from "./syncV2Stream.js";
import { elapsedMs } from "../../lib/timing.js";
import {
  APPLY_REJECT_REASONS,
  ENGINE_REJECT_REASONS,
  type ApplyRejectReason,
  type EngineRejectReason,
  type RejectReason,
} from "./syncV2-types.js";
import { readOriginDeviceId, recordSyncV2 } from "./syncV2-core.js";
import {
  applyRoutineEntries,
  applyRoutineStreaks,
} from "./routine/applySync.js";
import {
  applyRoutineCategories,
  applyRoutineCompletionNotes,
  applyRoutineHabitOrder,
  applyRoutineHabits,
  applyRoutinePrefs,
  applyRoutinePushups,
  applyRoutineTags,
} from "./routine/applySyncFullState.js";
import {
  applyFizrukWorkouts,
  applyFizrukItems,
  applyFizrukSets,
  applyFizrukCustomExercises,
  applyFizrukMeasurements,
} from "./fizruk/applySync.js";
import {
  applyFizrukDailyLog,
  applyFizrukMonthlyPlan,
  applyFizrukPlanTemplates,
  applyFizrukPrograms,
  applyFizrukWellbeing,
  applyFizrukWorkoutTemplates,
} from "./fizruk/applySyncFullState.js";
import {
  applyNutritionMeals,
  applyNutritionPantries,
  applyNutritionPantryItems,
  applyNutritionPrefs,
  applyNutritionRecipes,
} from "./nutrition/applySync.js";
import {
  applyNutritionShoppingList,
  applyNutritionWaterLog,
} from "./nutrition/applySyncFullState.js";
import {
  applyFinykHiddenAccounts,
  applyFinykHiddenTransactions,
  applyFinykBudgets,
  applyFinykSubscriptions,
  applyFinykAssets,
  applyFinykDebts,
  applyFinykReceivables,
  applyFinykCustomCategories,
  applyFinykManualExpenses,
  applyFinykTxFilters,
  applyFinykTxCategories,
  applyFinykTxSplits,
  applyFinykMonoDebtLinks,
  applyFinykNetworthHistory,
  applyFinykPrefs,
} from "./finyk/applySync.js";

export { APPLY_REJECT_REASONS, ENGINE_REJECT_REASONS };
export type { ApplyRejectReason, EngineRejectReason, RejectReason };

type WithSessionUser = Request & { user?: { id: string } };

type SyncV2Outcome =
  | "ok"
  | "empty"
  | "partial"
  | "conflict"
  | "invalid"
  | "too_large"
  | "unauthorized"
  | "error";

type AppliedStatus =
  { status: "applied" } | { status: "rejected"; reason: ApplyRejectReason };

type ApplyFn = (
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
) => Promise<AppliedStatus>;

interface SyncOpLogInsertRow {
  id: string;
  server_ts: Date;
}

interface SyncOpLogDuplicateRow {
  id: string;
  status: "applied" | "duplicate" | "rejected";
  reject_reason: string | null;
}

interface PullRow {
  id: string;
  table_name: string;
  op: "insert" | "update" | "delete";
  row: unknown;
  client_ts: Date;
  server_ts: Date;
  origin_device_id: string | null;
}

const CLOCK_SKEW_FORWARD_MS = 60 * 60 * 1000;

const OP_LOG_TABLE_REGISTRY: Record<string, ApplyFn> = {
  routine_entries: applyRoutineEntries,
  routine_streaks: applyRoutineStreaks,
  routine_habits: applyRoutineHabits,
  routine_tags: applyRoutineTags,
  routine_categories: applyRoutineCategories,
  routine_prefs: applyRoutinePrefs,
  routine_pushups: applyRoutinePushups,
  routine_habit_order: applyRoutineHabitOrder,
  routine_completion_notes: applyRoutineCompletionNotes,
  fizruk_workouts: applyFizrukWorkouts,
  fizruk_workout_items: applyFizrukItems,
  fizruk_workout_sets: applyFizrukSets,
  fizruk_custom_exercises: applyFizrukCustomExercises,
  fizruk_measurements: applyFizrukMeasurements,
  fizruk_daily_log: applyFizrukDailyLog,
  fizruk_monthly_plan: applyFizrukMonthlyPlan,
  fizruk_plan_templates: applyFizrukPlanTemplates,
  fizruk_programs: applyFizrukPrograms,
  fizruk_wellbeing: applyFizrukWellbeing,
  fizruk_workout_templates: applyFizrukWorkoutTemplates,
  nutrition_meals: applyNutritionMeals,
  nutrition_pantries: applyNutritionPantries,
  nutrition_pantry_items: applyNutritionPantryItems,
  nutrition_prefs: applyNutritionPrefs,
  nutrition_recipes: applyNutritionRecipes,
  nutrition_water_log: applyNutritionWaterLog,
  nutrition_shopping_list: applyNutritionShoppingList,
  finyk_hidden_accounts: applyFinykHiddenAccounts,
  finyk_hidden_transactions: applyFinykHiddenTransactions,
  finyk_budgets: applyFinykBudgets,
  finyk_subscriptions: applyFinykSubscriptions,
  finyk_assets: applyFinykAssets,
  finyk_debts: applyFinykDebts,
  finyk_receivables: applyFinykReceivables,
  finyk_custom_categories: applyFinykCustomCategories,
  finyk_manual_expenses: applyFinykManualExpenses,
  finyk_tx_filters: applyFinykTxFilters,
  finyk_tx_categories: applyFinykTxCategories,
  finyk_tx_splits: applyFinykTxSplits,
  finyk_mono_debt_links: applyFinykMonoDebtLinks,
  finyk_networth_history: applyFinykNetworthHistory,
  finyk_prefs: applyFinykPrefs,
};

export const INCREMENT_OP_SUPPORTED_TABLES = new Set<string>([
  "routine_streaks",
]);

export const SYNC_V2_SUPPORTED_TABLES = Object.freeze(
  Object.keys(OP_LOG_TABLE_REGISTRY),
);

export async function syncV2Push(req: Request, res: Response): Promise<void> {
  const start = process.hrtime.bigint();
  const user = (req as WithSessionUser).user!;
  const originDeviceId = readOriginDeviceId(req);

  let ops: SyncV2Op[];
  try {
    ({ ops } = parseBody(SyncV2PushSchema, req));
  } catch (err) {
    recordSyncV2("v2_push", "invalid", {
      ms: elapsedMs(start),
      userId: user.id,
    });
    throw err;
  }

  if (originDeviceId === null && ops.length > 0) {
    try {
      syncOpLogNullOriginDeviceIdTotal.inc({ module: "v2" });
    } catch {
      /* metrics must never break a request */
    }
  }

  const payloadBytes = JSON.stringify({ ops }).length;

  type OpResult = {
    idempotency_key: string;
    status: "applied" | "duplicate" | "rejected";
    reason?: string;
  };
  const results: OpResult[] = [];
  let acceptedCount = 0;
  let lastOpId = 0;
  let appliedCount = 0;
  let rejectedCount = 0;
  const newlyAppliedForStream: SyncV2StreamOp[] = [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const op of ops) {
      const dup = await client.query<SyncOpLogDuplicateRow>(
        `SELECT id, status, reject_reason
           FROM sync_op_log
          WHERE user_id = $1 AND idempotency_key = $2`,
        [user.id, op.idempotency_key],
      );
      if (dup.rows.length > 0) {
        const r = dup.rows[0];
        const id = Number(r!.id);
        if (id > lastOpId) lastOpId = id;
        results.push({
          idempotency_key: op.idempotency_key,
          status: r!.status,
          ...(r!.reject_reason != null
            ? { reason: r!.reject_reason }
            : r!.status === "duplicate"
              ? { reason: "duplicate" }
              : {}),
        });
        if (r!.status === "applied") {
          acceptedCount++;
          appliedCount++;
        } else if (r!.status === "rejected") {
          rejectedCount++;
        }
        try {
          syncOpLogApplyTotal.inc({
            table: op.table,
            status: "duplicate",
            reason: "duplicate",
          });
        } catch {
          /* metrics must never break a request */
        }
        continue;
      }

      const clientTs = new Date(op.client_ts);
      let status: "applied" | "rejected" = "applied";
      let reason: RejectReason | null = null;

      const skewMs = clientTs.getTime() - Date.now();
      if (skewMs > CLOCK_SKEW_FORWARD_MS) {
        status = "rejected";
        reason = "clock_skew";
      }

      if (
        status === "applied" &&
        op.op === "increment" &&
        !INCREMENT_OP_SUPPORTED_TABLES.has(op.table)
      ) {
        status = "rejected";
        reason = "op_not_supported";
      }

      const applyFn = OP_LOG_TABLE_REGISTRY[op.table];
      if (status === "applied" && !applyFn) {
        status = "rejected";
        reason = "table_not_allowed";
      }

      if (status === "applied" && applyFn) {
        await client.query("SAVEPOINT op_apply");
        try {
          const applied = await applyFn(client, op, user.id, clientTs);
          if (applied.status === "rejected") {
            status = "rejected";
            reason = applied.reason;
          }
        } catch (err: unknown) {
          status = "rejected";
          reason = "apply_failed";
          try {
            await client.query("ROLLBACK TO SAVEPOINT op_apply");
          } catch {
            /* primary rollback below will catch transactional poison */
          }
          logger.warn({
            msg: "sync_v2_apply_failed",
            op: op.op,
            table: op.table,
            err: err instanceof Error ? err.message : String(err),
          });
        }
        try {
          await client.query("RELEASE SAVEPOINT op_apply");
        } catch {
          /* idempotent: already released after rollback */
        }
      }

      const inserted = await client.query<SyncOpLogInsertRow>(
        `INSERT INTO sync_op_log
           (user_id, idempotency_key, table_name, op, row, client_ts,
            origin_device_id, status, reject_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, server_ts`,
        [
          user.id,
          op.idempotency_key,
          op.table,
          op.op,
          JSON.stringify(op.row),
          clientTs,
          originDeviceId,
          status,
          reason,
        ],
      );
      const insertedRow = inserted.rows[0];
      const insertedId = Number(insertedRow!.id);
      if (insertedId > lastOpId) lastOpId = insertedId;

      if (status === "applied") {
        acceptedCount++;
        appliedCount++;
        results.push({
          idempotency_key: op.idempotency_key,
          status: "applied",
        });
        newlyAppliedForStream.push({
          id: insertedId,
          table: op.table,
          op: op.op,
          row: op.row,
          client_ts: clientTs.toISOString(),
          server_ts: insertedRow!.server_ts.toISOString(),
          origin_device_id: originDeviceId,
        });
      } else {
        rejectedCount++;
        results.push({
          idempotency_key: op.idempotency_key,
          status: "rejected",
          ...(reason ? { reason } : {}),
        });
      }

      try {
        const labelTable =
          reason === "table_not_allowed" ? "__unknown__" : op.table;
        syncOpLogApplyTotal.inc({
          table: labelTable,
          status,
          reason: status === "applied" ? "none" : reason || "unknown",
        });
      } catch {
        /* metrics must never break a request */
      }
    }

    await client.query("COMMIT");
  } catch (err: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* secondary rollback failure swallowed */
    }
    recordSyncV2("v2_push", "error", {
      ms: elapsedMs(start),
      bytes: payloadBytes,
      userId: user.id,
    });
    throw err;
  } finally {
    client.release();
  }

  notifySyncV2OpsApplied(user.id, newlyAppliedForStream);

  const outcome: SyncV2Outcome =
    rejectedCount === 0
      ? appliedCount > 0
        ? "ok"
        : "empty"
      : appliedCount === 0
        ? "conflict"
        : "partial";
  recordSyncV2("v2_push", outcome, {
    ms: elapsedMs(start),
    bytes: payloadBytes,
    userId: user.id,
    extra: {
      ops: ops.length,
      applied: appliedCount,
      rejected: rejectedCount,
    },
  });

  res.json({
    accepted: acceptedCount,
    last_op_id: lastOpId,
    results,
  });
}

export async function syncV2Pull(req: Request, res: Response): Promise<void> {
  const start = process.hrtime.bigint();
  const user = (req as WithSessionUser).user!;

  let since: number;
  let limit: number;
  try {
    ({ since, limit } = parseQuery(SyncV2PullSchema, req));
  } catch (err) {
    recordSyncV2("v2_pull", "invalid", {
      ms: elapsedMs(start),
      userId: user.id,
    });
    throw err;
  }
  const originDeviceId = readOriginDeviceId(req);

  try {
    const result = await pool.query<PullRow>(
      `SELECT id, table_name, op, row, client_ts, server_ts, origin_device_id
         FROM sync_op_log
        WHERE user_id = $1
          AND id > $2
          AND status = 'applied'
          AND origin_device_id IS DISTINCT FROM $3
        ORDER BY id ASC
        LIMIT $4`,
      [user.id, since, originDeviceId, limit],
    );

    const opsOut = result.rows.map((r) => ({
      id: Number(r.id),
      table: r.table_name,
      op: r.op,
      row: r.row,
      client_ts: r.client_ts.toISOString(),
      server_ts: r.server_ts.toISOString(),
      // eslint-disable-next-line sergeant-design/no-bigint-string -- origin_device_id is an opaque TEXT device id (migration 027_sync_op_log.sql), not a pg bigint numeric; Hard Rule #1 N/A.
      origin_device_id: r.origin_device_id,
    }));

    const nextCursor =
      opsOut.length === limit ? opsOut[opsOut.length - 1]!.id : null;

    const bytes = result.rows.reduce((acc, r) => {
      try {
        return acc + JSON.stringify(r.row).length;
      } catch {
        return acc;
      }
    }, 0);

    try {
      syncOpLogPullQueueDepth.observe(opsOut.length);
      if (result.rows.length > 0) {
        const newest = result!.rows[result.rows.length - 1]!.server_ts;
        const lagMs = Date.now() - newest.getTime();
        if (lagMs >= 0 && Number.isFinite(lagMs)) {
          syncOpLogPullLagMs.observe(lagMs);
        }
      }
    } catch {
      /* metrics must never break a request */
    }

    recordSyncV2("v2_pull", opsOut.length === 0 ? "empty" : "ok", {
      ms: elapsedMs(start),
      bytes,
      userId: user.id,
      extra: { since, limit, returned: opsOut.length },
    });

    res.json({
      ops: opsOut,
      next_cursor: nextCursor,
    });
  } catch (err) {
    recordSyncV2("v2_pull", "error", {
      ms: elapsedMs(start),
      userId: user.id,
    });
    throw err;
  }
}
