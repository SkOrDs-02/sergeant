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
  decryptOpRowForPull,
  encryptOpRowForStorage,
} from "../../lib/healthTextCrypto.js";
import {
  syncConflictsTotal,
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
import { applyRoutineCompletionEvents } from "./routine/applyCompletionEvents.js";
import {
  applyRoutineCompletionNotes,
  applyRoutineHabitSkips,
  applyRoutineHabitOrder,
  applyRoutineHabits,
  applyRoutinePrefs,
  applyUuidNameScopeTable,
} from "./routine/applySyncFullState.js";
import {
  applyFizrukWorkouts,
  applyFizrukItems,
  applyFizrukSets,
  applyFizrukCustomActivities,
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
import { applyFizrukInjuries } from "./fizruk/applyInjuries.js";
import {
  applyNutritionMeals,
  applyNutritionPantries,
  applyNutritionPantryItems,
  applyNutritionPrefs,
  applyNutritionRecipes,
} from "./nutrition/applySync.js";
import { applyNutritionPantryEvents } from "./nutrition/applyPantryEvents.js";
import { applyNutritionGoalPeriods } from "./nutrition/applySyncGoals.js";
import {
  applyNutritionShoppingList,
  applyNutritionWaterLog,
} from "./nutrition/applySyncFullState.js";
import {
  applyFinykHiddenAccounts,
  applyFinykHiddenTransactions,
  applyFinykPerRowBlob,
  applyFinykPerTxJsonbArray,
  applyFinykTxCategories,
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

// Tables whose apply logic is identical bar the table name (and, for tx-scoped
// jsonb arrays, the payload column) bind the shared implementation directly in
// the registry instead of each getting a one-line delegating wrapper.
const perRowBlob =
  (table: string): ApplyFn =>
  (client, op, userId, clientTs) =>
    applyFinykPerRowBlob(client, op, userId, clientTs, table);

const perTxJsonb =
  (
    table: "finyk_tx_splits" | "finyk_mono_debt_links",
    jsonColumn: "splits_json" | "debt_ids_json",
  ): ApplyFn =>
  (client, op, userId, clientTs) =>
    applyFinykPerTxJsonbArray(client, op, userId, clientTs, table, jsonColumn);

const uuidNameScope =
  (table: "routine_tags" | "routine_categories"): ApplyFn =>
  (client, op, userId, clientTs) =>
    applyUuidNameScopeTable(client, table, op, userId, clientTs);

const OP_LOG_TABLE_REGISTRY: Record<string, ApplyFn> = {
  routine_entries: applyRoutineEntries,
  routine_streaks: applyRoutineStreaks,
  routine_habits: applyRoutineHabits,
  routine_tags: uuidNameScope("routine_tags"),
  routine_categories: uuidNameScope("routine_categories"),
  routine_prefs: applyRoutinePrefs,
  routine_habit_order: applyRoutineHabitOrder,
  routine_completion_notes: applyRoutineCompletionNotes,
  // Хвиля 4 — третій стан дня «не зміг з причиною» (канон §5).
  routine_habit_skips: applyRoutineHabitSkips,
  // W1-ROUTINE-APPEND стадія 1 — append-only журнал відміток. `op='update'`
  // / `'delete'` відхиляються з `append_only_violation`; читачів у цій
  // стадії нема.
  routine_completion_events: applyRoutineCompletionEvents,
  fizruk_workouts: applyFizrukWorkouts,
  fizruk_workout_items: applyFizrukItems,
  fizruk_workout_sets: applyFizrukSets,
  fizruk_custom_exercises: applyFizrukCustomExercises,
  fizruk_custom_activities: applyFizrukCustomActivities,
  fizruk_measurements: applyFizrukMeasurements,
  fizruk_daily_log: applyFizrukDailyLog,
  fizruk_monthly_plan: applyFizrukMonthlyPlan,
  fizruk_plan_templates: applyFizrukPlanTemplates,
  fizruk_programs: applyFizrukPrograms,
  fizruk_wellbeing: applyFizrukWellbeing,
  fizruk_workout_templates: applyFizrukWorkoutTemplates,
  // Модель «не можна» (ADR-0083). `site` навмисно не валідується проти
  // серверного enum — словник зон живе в домені й росте, а нерозпізнане
  // значення клієнт відкидає в `activeInjurySites`, тобто воно деградує в
  // «нічого не блокує», а не в помилку.
  fizruk_injuries: applyFizrukInjuries,
  nutrition_meals: applyNutritionMeals,
  nutrition_pantries: applyNutritionPantries,
  nutrition_pantry_items: applyNutritionPantryItems,
  // W1-PANTRY-APPEND стадія 1 — append-only журнал руху продуктів комори.
  // `op='update'` відхиляється з `append_only_violation`, `op='delete'` —
  // лише tombstone-ретракція. `op='increment'` НЕ потрібен: append-only
  // рядки комутативні самі по собі, тож `INCREMENT_OP_SUPPORTED_TABLES`
  // нижче лишається як є. Ні писарів, ні читачів на цій стадії.
  nutrition_pantry_events: applyNutritionPantryEvents,
  // W1-KBJU-APPEND стадія 1 — append-only журнал цілей КБЖВ. Свідомо БЕЗ
  // LWW-guard-а, на відміну від сусіднього `nutrition_prefs`: дві зміни
  // цілі з двох пристроїв у різні дні — це дві сходинки історії, а не
  // конфлікт. `op='update'` → `append_only_violation`, `op='delete'` —
  // лише tombstone-ретракція. `INCREMENT_OP_SUPPORTED_TABLES` нижче не
  // чіпаємо: append-only рядки комутативні самі по собі.
  nutrition_goal_periods: applyNutritionGoalPeriods,
  nutrition_prefs: applyNutritionPrefs,
  nutrition_recipes: applyNutritionRecipes,
  nutrition_water_log: applyNutritionWaterLog,
  nutrition_shopping_list: applyNutritionShoppingList,
  finyk_hidden_accounts: applyFinykHiddenAccounts,
  finyk_hidden_transactions: applyFinykHiddenTransactions,
  finyk_budgets: perRowBlob("finyk_budgets"),
  finyk_subscriptions: perRowBlob("finyk_subscriptions"),
  finyk_assets: perRowBlob("finyk_assets"),
  finyk_debts: perRowBlob("finyk_debts"),
  finyk_receivables: perRowBlob("finyk_receivables"),
  finyk_custom_categories: perRowBlob("finyk_custom_categories"),
  finyk_manual_expenses: perRowBlob("finyk_manual_expenses"),
  finyk_tx_filters: perRowBlob("finyk_tx_filters"),
  finyk_tx_categories: applyFinykTxCategories,
  finyk_tx_splits: perTxJsonb("finyk_tx_splits", "splits_json"),
  finyk_mono_debt_links: perTxJsonb("finyk_mono_debt_links", "debt_ids_json"),
  finyk_networth_history: applyFinykNetworthHistory,
  finyk_prefs: applyFinykPrefs,
};

export const INCREMENT_OP_SUPPORTED_TABLES = new Set<string>([
  "routine_streaks",
]);

export const SYNC_V2_SUPPORTED_TABLES = Object.freeze(
  Object.keys(OP_LOG_TABLE_REGISTRY),
);

/**
 * `op.table` приходить сирим із тіла запиту, тож належність до реєстру
 * перевіряємо лише по власних ключах — інакше `constructor` / `toString`
 * резолвляться через прототип і дають фальшивий `applied` без запису в БД.
 */
function lookupApplyFn(table: string): ApplyFn | undefined {
  return Object.prototype.hasOwnProperty.call(OP_LOG_TABLE_REGISTRY, table)
    ? OP_LOG_TABLE_REGISTRY[table]
    : undefined;
}

/**
 * Лейбл `table` для `sync_op_log_apply_total`. Реєстр — єдине джерело
 * дозволених значень; усе інше згортаємо в `__unknown__`, щоб тіло запиту
 * не роздувало кардинальність серії (бюджет — `obs/metrics/sync.ts`).
 */
function metricTable(table: string): string {
  return lookupApplyFn(table) ? table : "__unknown__";
}

/**
 * Module label for `sync_conflicts_total` (W4 — метрика конфліктів була
 * оголошена в `obs/metrics/domain.ts`, але жоден код її не інкрементив, тож
 * `sum by (module) (rate(sync_conflicts_total[1h]))` з runbook.md
 * (`SyncConflictSpike`) завжди повертав порожній результат).
 *
 * Усі таблиці в `OP_LOG_TABLE_REGISTRY` іменовані `<module>_<rest>`
 * (`routine_*`, `fizruk_*`, `nutrition_*`, `finyk_*`), тож перший
 * underscore-сегмент однозначно визначає продуктовий модуль — окремого
 * реєстру мапінгу не треба, і нова таблиця автоматично потрапляє в
 * правильний label без правки цього файлу.
 */
function conflictModule(table: string): string {
  const prefix = table.split("_")[0];
  return prefix ? prefix : "unknown";
}

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

  /**
   * Оп уже лежить у журналі. Два шляхи сюди: дедуп-SELECT на початку
   * ітерації і `ON CONFLICT` після гонки двох вкладок одного акаунта.
   * Результат для клієнта в обох випадках однаковий, тож і код один.
   */
  const recordExistingOpLogRow = (
    sourceOp: SyncV2Op,
    r: SyncOpLogDuplicateRow,
  ): void => {
    const id = Number(r.id);
    if (id > lastOpId) lastOpId = id;
    results.push({
      idempotency_key: sourceOp.idempotency_key,
      status: r.status,
      ...(r.reject_reason != null
        ? { reason: r.reject_reason }
        : r.status === "duplicate"
          ? { reason: "duplicate" }
          : {}),
    });
    if (r.status === "applied") {
      acceptedCount++;
      appliedCount++;
    } else if (r.status === "rejected") {
      rejectedCount++;
    }
    try {
      syncOpLogApplyTotal.inc({
        table: metricTable(sourceOp.table),
        status: "duplicate",
        reason: "duplicate",
      });
    } catch {
      /* metrics must never break a request */
    }
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Один дедуп-SELECT на весь батч замість одного на оп. Мапа
    // доповнюється по ходу циклу, тож повтор ключа всередині одного пуша
    // бачить рядок, записаний раніше в цьому ж батчі. Паралельний пуш, що
    // закомітився вже після цього SELECT-а, ловить ON CONFLICT нижче, і
    // тоді apply цього опа відкочується до savepoint-а `op_apply`.
    const knownOps = new Map<string, SyncOpLogDuplicateRow>();
    const prior = await client.query<
      SyncOpLogDuplicateRow & { idempotency_key: string }
    >(
      `SELECT id, status, reject_reason, idempotency_key
         FROM sync_op_log
        WHERE user_id = $1 AND idempotency_key = ANY($2::text[])`,
      [user.id, ops.map((o) => o.idempotency_key)],
    );
    for (const r of prior.rows) knownOps.set(r.idempotency_key, r);

    for (const op of ops) {
      const known = knownOps.get(op.idempotency_key);
      if (known) {
        recordExistingOpLogRow(op, known);
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

      const applyFn = lookupApplyFn(op.table);
      if (status === "applied" && !applyFn) {
        status = "rejected";
        reason = "table_not_allowed";
      }

      // `op_apply` лишається відкритим до запису в журнал: якщо ON CONFLICT
      // покаже, що цей ключ уже записав паралельний пуш, apply відкочується.
      let applySavepointOpen = false;
      if (status === "applied" && applyFn) {
        await client.query("SAVEPOINT op_apply");
        applySavepointOpen = true;
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
      }

      // Запис у журнал — під ВЛАСНИМ savepoint-ом. Доти він стояв голим у
      // зовнішній транзакції, тож будь-яка його помилка летіла в catch нижче
      // і робила ROLLBACK усього батча: сотня рядків отримувала 500 і палила
      // спробу через ОДИН зіпсований оп. Два реальні тригери:
      //   (а) гонка двох вкладок одного акаунта на унікальному
      //       `sync_op_log_user_idem_key` — клієнтський гард «один тік за раз»
      //       живе per-runtime, тобто per-tab, і батчі вкладок перетинаються;
      //   (б) символ `U+0000` у будь-якому рядковому полі `row` — zod його
      //       пропускає, Postgres `jsonb` ні, і такий оп стає poison pill, що
      //       щоразу забирає з собою 99 сусідів.
      // `ON CONFLICT … DO NOTHING` знімає (а) штатно: хто програв гонку,
      // бачить порожній RETURNING, дочитує рядок переможця й віддає клієнту
      // звичайний `duplicate` замість 500. (б) лишається помилкою, але
      // локальною — оп відхиляється, решта батча їде далі.
      let insertedRow: SyncOpLogInsertRow | undefined;
      let racedRow: SyncOpLogDuplicateRow | undefined;
      let oplogWriteFailed = false;

      await client.query("SAVEPOINT op_log_write");
      try {
        const inserted = await client.query<SyncOpLogInsertRow>(
          `INSERT INTO sync_op_log
             (user_id, idempotency_key, table_name, op, row, client_ts,
              origin_device_id, status, reject_reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (user_id, idempotency_key) DO NOTHING
           RETURNING id, server_ts`,
          [
            user.id,
            op.idempotency_key,
            op.table,
            op.op,
            JSON.stringify(encryptOpRowForStorage(op.table, op.row)),
            clientTs,
            originDeviceId,
            status,
            reason,
          ],
        );
        insertedRow = inserted.rows[0];
        if (!insertedRow) {
          const raced = await client.query<SyncOpLogDuplicateRow>(
            `SELECT id, status, reject_reason
               FROM sync_op_log
              WHERE user_id = $1 AND idempotency_key = $2`,
            [user.id, op.idempotency_key],
          );
          racedRow = raced.rows[0];
          // Конфлікт був, а рядка немає — стан, якого бути не може
          // (переможець гонки вже закомічений, інакше INSERT би чекав).
          // Ковтати його як успіх не можна: оп нікуди не записано.
          if (!racedRow) oplogWriteFailed = true;
        }
      } catch (err: unknown) {
        oplogWriteFailed = true;
        try {
          await client.query("ROLLBACK TO SAVEPOINT op_log_write");
        } catch {
          /* primary rollback below will catch transactional poison */
        }
        logger.warn({
          msg: "sync_v2_oplog_write_failed",
          op: op.op,
          table: op.table,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        await client.query("RELEASE SAVEPOINT op_log_write");
      } catch {
        /* idempotent: already released after rollback */
      }
      if (applySavepointOpen) {
        try {
          if (racedRow) await client.query("ROLLBACK TO SAVEPOINT op_apply");
          await client.query("RELEASE SAVEPOINT op_apply");
        } catch {
          /* primary rollback below will catch transactional poison */
        }
      }

      if (oplogWriteFailed) {
        // Рядка в журналі немає, тож pull його не віддасть нікому — для
        // клієнта це термінальна відмова, а не привід ретраїти: повтор дасть
        // ту саму помилку. Батч при цьому цілий.
        rejectedCount++;
        results.push({
          idempotency_key: op.idempotency_key,
          status: "rejected",
          reason: "oplog_write_failed",
        });
        try {
          syncOpLogApplyTotal.inc({
            table: metricTable(op.table),
            status: "rejected",
            reason: "oplog_write_failed",
          });
        } catch {
          /* metrics must never break a request */
        }
        continue;
      }

      if (!insertedRow) {
        knownOps.set(op.idempotency_key, racedRow!);
        recordExistingOpLogRow(op, racedRow!);
        continue;
      }
      knownOps.set(op.idempotency_key, {
        id: insertedRow.id,
        status,
        reject_reason: reason,
      });

      const insertedId = Number(insertedRow.id);
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
          server_ts: insertedRow.server_ts.toISOString(),
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
        syncOpLogApplyTotal.inc({
          table: metricTable(op.table),
          status,
          reason: status === "applied" ? "none" : reason || "unknown",
        });
        // Only the freshly-computed rejection counts as a conflict — a
        // duplicate replay of the same idempotency_key (branch above) is a
        // client retry of an ALREADY-counted decision, not a new one.
        if (status === "rejected" && reason === "lww_conflict") {
          syncConflictsTotal.inc({ module: conflictModule(op.table) });
        }
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
    // Годинник сервера в момент відповіді. Сервер перевіряє лише годинник,
    // що ВИПЕРЕДЖАЄ (`CLOCK_SKEW_FORWARD_MS`); відсталий годинник програє
    // кожен LWW-конфлікт, і клієнт вважав це штатним `lww_conflict`. Це
    // поле дає клієнту прямий замір зсуву (`core/syncEngine/clockSkew.ts`),
    // без окремого round-trip-у й без довіри до `Date` header-а проксі
    // (аудит 2026-09-15 § 2).
    server_now: new Date().toISOString(),
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
          AND (tx_id IS NULL OR tx_id < pg_snapshot_xmin(pg_current_snapshot()))
        ORDER BY id ASC
        LIMIT $4`,
      [user.id, since, originDeviceId, limit],
    );

    const opsOut = result.rows.map((r) => ({
      id: Number(r.id),
      table: r.table_name,
      op: r.op,
      row: decryptOpRowForPull(r.table_name, r.row),
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
