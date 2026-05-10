import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import pool from "../../db.js";
import { validateBody, validateQuery } from "../../http/validate.js";
import {
  SyncV2PullSchema,
  SyncV2PushSchema,
  type SyncV2Op,
} from "../../http/schemas.js";
import { logger } from "../../obs/logger.js";
import {
  syncDurationMs,
  syncOperationsTotal,
  syncOpLogApplyTotal,
  syncOpLogPullLagMs,
  syncOpLogPullQueueDepth,
  syncPayloadBytes,
} from "../../obs/metrics.js";
import { notifySyncV2OpsApplied, type SyncV2StreamOp } from "./syncV2Stream.js";

/**
 * v2 op-log sync — Stage 2 / PR #021 із `docs/planning/storage-roadmap.md`.
 *
 * На відміну від v1 (`./sync.ts`), що пуш-пулить whole-blob LWW у
 * `module_data`, v2 приймає stream per-row операцій (`insert`/
 * `update`/`delete`) для нормалізованих per-module таблиць. Кожна
 * операція durably записується у `sync_op_log` (міграція 027) разом
 * із idempotency-ключем, тож:
 *
 *   * Реплеї офлайн-клієнта — no-op на повторний push;
 *   * `pull?since=<id>` стрімить нові ops іншим пристроям того ж
 *     юзера (cursor-based, append-only);
 *   * `client_ts` дає apply-шляху per-row last-write-wins.
 *
 * v1 і v2 існують паралельно до Stage 7 (PR #052 cleanup). v2 — це
 * фундамент під Stage 3 SPIKE (PR #022 — routine SPIKE) та Stage 4–5
 * (per-module міграції + клієнтський op log).
 */

type WithSessionUser = Request & { user?: { id: string } };

type SyncV2OpKind = "v2_push" | "v2_pull";

/**
 * Outcome для v2 sync_event / `sync_audit_log`. Дзеркалить (й
 * розширює) `SyncOutcome` з v1: додано `partial` для batch-push,
 * де якісь ops applied, якісь rejected. Audit-стовпець `outcome` —
 * TEXT без CHECK, тому розширення безпечне; admin-фільтр в
 * `audit.ts` досі приймає лише v1-значення, але це read-side і не
 * впливає на запис.
 */
type SyncV2Outcome =
  | "ok"
  | "empty"
  | "partial"
  | "conflict"
  | "invalid"
  | "too_large"
  | "unauthorized"
  | "error";

/**
 * Закритий enum причин відхилення, які повертають apply-функції.
 * Дзеркалить allowlist у `docs/observability/metrics.md` §4
 * (`sync_op_log_apply_total{reason}`) + `docs/observability/dashboards/sync.json`
 * (top-10 reject reasons panel).
 *
 * Експортуємо як `as const`-масив, аби однакові літерали слугували
 * і compile-time union-ом (`ApplyRejectReason`), і runtime
 * introspection-джерелом для regression-тесту в
 * `apps/server/src/obs/metrics.test.ts`. Розширення/перейменування
 * причини потребує синхронного апдейту:
 *   1. `docs/observability/metrics.md` §4 (cardinality budget),
 *   2. `docs/observability/dashboards/sync.json` (top-10 reject panel),
 *   3. цього `as const`-масиву.
 *
 * Категорії:
 *   - **CRDT-інваріанти** (`lww_conflict`, `tombstoned`, `not_found`,
 *     `delete_not_supported`) — очікувані відмови per Stage 5 op-log контракту.
 *   - **Authorization** (`user_id_mismatch`, `fk_violation`) — payload не
 *     належить session user.
 *   - **`missing_*`** — обов'язкові payload-поля відсутні.
 *   - **`invalid_*`** — поле не парситься у domain тип
 *     (date / int / float у валідному діапазоні).
 */
export const APPLY_REJECT_REASONS = [
  // CRDT / per-row state invariants
  "lww_conflict",
  "tombstoned",
  "not_found",
  "delete_not_supported",
  // Authorization
  "user_id_mismatch",
  "fk_violation",
  // Required payload fields
  "missing_id",
  "missing_name",
  "missing_name_uk",
  "missing_ext_id",
  "missing_tx_id",
  "missing_category_id",
  "missing_data_json",
  "missing_exercise_id",
  "missing_workout_id",
  "missing_workout_item_id",
  "missing_pantry_id",
  // Field validation — timestamps
  "invalid_completed_at",
  "invalid_deleted_at",
  "invalid_created_at",
  "invalid_started_at",
  "invalid_ended_at",
  "invalid_last_completed_at",
  "invalid_measured_at",
  "invalid_eaten_at",
  // Field validation — anthropometry
  "invalid_weight_kg",
  "invalid_waist_cm",
  "invalid_chest_cm",
  "invalid_hips_cm",
  "invalid_bicep_cm",
  "invalid_sleep_hours",
  "invalid_networth",
  // Field validation — nutrition
  "invalid_kcal",
  "invalid_protein_g",
  "invalid_fat_g",
  "invalid_carbs_g",
  "invalid_amount_g",
  "invalid_qty",
  // Field validation — wellbeing / mood
  "invalid_mood",
  "invalid_energy_level",
  // Field validation — workout metrics
  "invalid_distance_m",
  "invalid_duration_sec",
  "invalid_reps",
  "invalid_rpe",
  // Field validation — calendar
  "invalid_month",
  // Field validation — PN-counter primitive (PR #042b)
  "missing_delta",
  "invalid_delta",
] as const;

export type ApplyRejectReason = (typeof APPLY_REJECT_REASONS)[number];

/**
 * Engine-level причини відхилення, які виставляє `syncV2Push`
 * **без** виклику apply-функції (clock guard, whitelist, savepoint
 * exception, idempotent replay). Об'єднання з `ApplyRejectReason`
 * дає повний всесвіт `reject_reason` колонки у `sync_op_log` —
 * жоден інший літерал не має туди потрапити.
 */
export const ENGINE_REJECT_REASONS = [
  "clock_skew",
  "table_not_allowed",
  "apply_failed",
  "duplicate",
  // Stage 5 / PR #042a: emitted when the engine sees `op='increment'`
  // for a table that is not in `INCREMENT_OP_SUPPORTED_TABLES` (today
  // the whitelist is empty — PR #042b will opt-in `routine_streaks`).
  // Pre-apply gate; no DML is attempted, so apply_failed cannot mask it.
  "op_not_supported",
] as const;

export type EngineRejectReason = (typeof ENGINE_REJECT_REASONS)[number];

/**
 * Повний всесвіт `reject_reason` для `sync_op_log` + метрика
 * `sync_op_log_apply_total{reason}`. Всі колл-сайти всередині
 * `syncV2Push` мають вживати літерали з цього об'єднання — TS
 * відмовить компіляцію на typo, що раніше тихо потрапляло у
 * Prometheus із unbounded cardinality.
 */
export type RejectReason = ApplyRejectReason | EngineRejectReason;

type AppliedStatus =
  | { status: "applied" }
  | { status: "rejected"; reason: ApplyRejectReason };

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

/** Module label для метрик/логів — стабільний `v2`, незалежно від `table`. */
const SYNC_V2_MODULE = "v2";

/**
 * Maximum tolerated forward clock skew. Клієнти, що надсилають
 * `client_ts > server_ts + 1h`, відхиляються — інакше їхній
 * "майбутній" timestamp перевертатиме LWW і ламатиме реплікацію
 * для нормальних пристроїв.
 */
const CLOCK_SKEW_FORWARD_MS = 60 * 60 * 1000;

/**
 * Whitelist таблиць, для яких apply-шар знає, як виконати DML.
 * Початкова версія (PR #021) — тільки routine_*; нові модулі
 * додаються тут разом із власним `applyXxx` на час Stage 4.
 *
 * Stage 4 PR #029: додано 5 fizruk-таблиць (split на per-row
 * apply-функції за патерном `applyRoutineEntries`). Дзеркальні
 * client-side dual-write ops живуть у
 * `apps/{web,mobile}/src/modules/fizruk/lib/dualWrite/adapter.ts`.
 *
 * TODO(roadmap-pr-050): партиціювання + архівація `sync_op_log` —
 * щоб таблиця не росла unbounded.
 */
const OP_LOG_TABLE_REGISTRY: Record<string, ApplyFn> = {
  routine_entries: applyRoutineEntries,
  routine_streaks: applyRoutineStreaks,
  fizruk_workouts: applyFizrukWorkouts,
  fizruk_workout_items: applyFizrukItems,
  fizruk_workout_sets: applyFizrukSets,
  fizruk_custom_exercises: applyFizrukCustomExercises,
  fizruk_measurements: applyFizrukMeasurements,
  nutrition_meals: applyNutritionMeals,
  nutrition_pantries: applyNutritionPantries,
  nutrition_pantry_items: applyNutritionPantryItems,
  nutrition_prefs: applyNutritionPrefs,
  nutrition_recipes: applyNutritionRecipes,
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

/**
 * Tables that opt-in to PN-counter semantics (`op='increment'` carrying
 * a numeric `delta` payload). PR #042b adds `routine_streaks` here
 * together with the atomic `INSERT … ON CONFLICT DO UPDATE SET
 * current_streak = current_streak + delta` apply-path inside
 * `applyRoutineStreaks`. Engine pre-apply gate (in `syncV2Push` below)
 * rejects every `op='increment'` against a table outside this set
 * with `reason='op_not_supported'`, so the widened CHECK constraint
 * from migration 040 cannot accidentally let a counter row land in
 * `sync_op_log` ahead of an apply-fn that understands it.
 *
 * Governance. Adding a new PN-counter table requires (1) adding the
 * literal here, (2) extending the matching apply-fn with an
 * `op === 'increment'` branch that persists `delta` atomically,
 * (3) updating cardinality calc у `docs/observability/metrics.md` §4
 * (нові `*_delta` reject-причини), (4) regression test у
 * `metrics.test.ts` для довжини `APPLY_REJECT_REASONS`. Той самий
 * pattern, що для `OP_LOG_TABLE_REGISTRY` — TS-tsc блокує accidental
 * drift між gate-ом і dispatcher-ом.
 */
export const INCREMENT_OP_SUPPORTED_TABLES = new Set<string>([
  "routine_streaks",
]);

/**
 * Captured truncated header. `X-Origin-Device-Id` — опціональний
 * client-supplied ідентифікатор пристрою; `pull` виключає ops з тим
 * самим device-id, щоб клієнт не реплеїв власні writes. Обмежуємо
 * довжину до 64 char, щоб уникнути smuggle-атак на JSON-fields.
 */
function readOriginDeviceId(req: Request): string | null {
  const raw = req.headers["x-origin-device-id"];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 64);
  return trimmed.length > 0 ? trimmed : null;
}

function elapsedMs(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

/**
 * Спільне місце: метрика + structured `sync_event` лог + audit-row.
 * Дублює форму `recordSync` з v1 (`./sync.ts`), але з власним вузьким
 * контрактом outcome (включаючи `partial`) і модулем `v2` за
 * замовчуванням.
 */
function recordSyncV2(
  op: SyncV2OpKind,
  outcome: SyncV2Outcome,
  {
    ms,
    bytes,
    userId,
    extra,
  }: {
    ms?: number;
    bytes?: number;
    userId?: string | null;
    extra?: Record<string, unknown>;
  } = {},
): void {
  try {
    syncOperationsTotal.inc({ op, module: SYNC_V2_MODULE, outcome });
    if (ms != null) syncDurationMs.observe({ op, module: SYNC_V2_MODULE }, ms);
    if (bytes != null)
      syncPayloadBytes.observe({ op, module: SYNC_V2_MODULE }, bytes);
  } catch {
    /* metrics must never break a request */
  }

  const level: "info" | "warn" | "error" =
    outcome === "error"
      ? "error"
      : outcome === "conflict" ||
          outcome === "invalid" ||
          outcome === "too_large" ||
          outcome === "unauthorized" ||
          outcome === "partial"
        ? "warn"
        : "info";
  try {
    logger[level]({
      msg: "sync_event",
      op,
      module: SYNC_V2_MODULE,
      outcome,
      ms: ms != null ? Math.round(ms) : undefined,
      bytes,
      ...(extra || {}),
    });
  } catch {
    /* logging must never break a request */
  }

  // Audit: тримаємо ту ж семантику, що й v1. invalid/unauthorized/too_large
  // — це валідаційні reject-и до того, як юзер виконав хоч щось над
  // даними, тож пропускаємо їх (як і `auditSync()` у v1).
  if (
    !userId ||
    outcome === "invalid" ||
    outcome === "unauthorized" ||
    outcome === "too_large"
  ) {
    return;
  }
  try {
    const promise = pool.query(
      `INSERT INTO sync_audit_log
         (user_id, op_type, module, outcome, conflict, payload_size_bytes, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        op,
        SYNC_V2_MODULE,
        outcome,
        outcome === "conflict",
        bytes ?? null,
        ms != null ? Math.round(ms) : null,
      ],
    );
    if (promise && typeof (promise as Promise<unknown>).catch === "function") {
      (promise as Promise<unknown>).catch((err: unknown) => {
        try {
          logger.warn({
            msg: "sync_audit_insert_failed",
            op,
            module: SYNC_V2_MODULE,
            outcome,
            err: err instanceof Error ? err.message : String(err),
          });
        } catch {
          /* logging must never break a request */
        }
      });
    }
  } catch {
    /* audit must never break a request */
  }
}

/**
 * Apply-шлях для `routine_entries`. Кожна операція — повний UPSERT за
 * `id` (UUID PK). LWW-guard: existing.updated_at < clientTs. Власник
 * рядка перевіряється явно SELECT-ом до DML-у — якщо PK уже існує і
 * належить іншому юзеру, повертаємо `fk_violation` замість `lww_conflict`,
 * щоб не ховати security-related reject в нормальній conflict-метриці.
 *
 * Soft-delete: `op === "delete"` → ставимо `deleted_at = clientTs`,
 * `updated_at = clientTs`. Жорстке видалення не використовується для
 * Routine, бо клієнт може потім повернути виконання.
 *
 * Tombstone-resurrection guard (Stage 5, дзеркалить PR #043 для
 * `nutrition_meals`): після soft-delete `op='insert'`/`op='update'`
 * проти tombstoned-у ряд відхиляється з `reason='tombstoned'`. Інакше
 * stale offline-edit на одному девайсі скасовував би delete на іншому.
 * `op='delete'` лишається ідемпотентним — re-stamp-ить `deleted_at`
 * новішим `client_ts`.
 */
async function applyRoutineEntries(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  // Cross-user ownership check. Якщо клієнт надіслав `user_id` у row,
  // воно мусить збігатись із сесією; якщо ні — підставляємо у DML
  // server-side userId, щоб не дозволяти smuggle через payload.
  if (row["user_id"] != null && row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{
    user_id: string;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT user_id, updated_at, deleted_at FROM routine_entries WHERE id = $1`,
    [id],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    // Tombstone-resurrection guard — див. док-стрінг.
    if (existing!.rows[0]!.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    await client.query(
      `UPDATE routine_entries
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const name = typeof row["name"] === "string" ? row["name"] : null;
  if (!name) return { status: "rejected", reason: "missing_name" };

  const completedAt = parseOptionalDate(row["completed_at"]);
  if (completedAt === "invalid") {
    return { status: "rejected", reason: "invalid_completed_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO routine_entries
         (id, user_id, name, completed_at, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        userId,
        name,
        completedAt ?? null,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE routine_entries
         SET name = $1,
             completed_at = $2,
             updated_at = $3,
             deleted_at = $4
       WHERE id = $5 AND user_id = $6`,
      [name, completedAt ?? null, clientTs, deletedAt ?? null, id, userId],
    );
  }
  return { status: "applied" };
}

/**
 * Maximum allowed |delta| in a single `op='increment'` payload. PN-counter
 * primitive is built for ±1 toggles (one habit-completion per emit), so
 * a hard cap at 1000 keeps a malformed/malicious client from corrupting
 * the streak counter with `delta=Number.MAX_SAFE_INTEGER`. INTEGER
 * column overflow would otherwise raise PG `numeric value out of range`
 * inside the SAVEPOINT — the cap turns it into a clean apply-level
 * `invalid_delta` reject before DML.
 */
const INCREMENT_DELTA_MAX_ABS = 1000;

/**
 * Apply-шлях для `routine_streaks` (per-user aggregate). PK = user_id,
 * один рядок на юзера; історичного `updated_at` нема. LWW-guard
 * робимо проти `MAX(client_ts)` із `sync_op_log` для (user_id,
 * `routine_streaks`, status='applied') — так v2 не залежить від форми
 * конкретної таблиці й може застосовуватись для будь-якої агрегованої
 * сутності в Stage 4.
 *
 * `delete` — жорстке видалення (немає soft-delete-стовпця). Клієнт
 * рідко це виконує, але семантика синхронна з реальною кнопкою
 * "reset streaks".
 *
 * `increment` (PR #042b) — PN-counter primitive: атомарний
 * `INSERT … ON CONFLICT DO UPDATE SET current_streak =
 * current_streak + delta`, з clamp-ом до `MAX(0, …)` щоб лічильник
 * не йшов у мінус (UI assumes non-negative). `longest_streak` —
 * derived `GREATEST(longest_streak, new_current_streak)`, тобто
 * монотонний максимум за всю історію. LWW-guard НЕ блокує increment-
 * и (інакше другий toggle того самого пристрою з ідентичним `client_ts`
 * губився б), на відміну від insert/update — там LWW потрібен щоб
 * стара версія не перетирала свіжу.
 */
async function applyRoutineStreaks(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  if (row["user_id"] != null && row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  if (op.op === "increment") {
    if (row["delta"] == null) {
      return { status: "rejected", reason: "missing_delta" };
    }
    if (
      typeof row["delta"] !== "number" ||
      !Number.isFinite(row["delta"]) ||
      !Number.isInteger(row["delta"]) ||
      Math.abs(row["delta"]) > INCREMENT_DELTA_MAX_ABS
    ) {
      return { status: "rejected", reason: "invalid_delta" };
    }
    const delta = row["delta"];
    // Атомарний upsert. Початковий рядок засіюється з `MAX(0, delta)` —
    // якщо клієнт надіслав `delta=-1` без попереднього insert-а, ми не
    // створюємо рядок із `current_streak = -1` (порушує домен-інваріант),
    // а сідаємо у 0. На вже існуючому рядку `current_streak + delta`
    // обчислюється всередині SQL-виразу, тому між двома пушами одного
    // юзера race-condition відсутній (PG row-level lock у тій самій
    // транзакції). `longest_streak = GREATEST(...)` робить максимум
    // монотонним.
    await client.query(
      `INSERT INTO routine_streaks
         (user_id, current_streak, longest_streak, last_completed_at)
       VALUES ($1, GREATEST(0, $2::int), GREATEST(0, $2::int), NULL)
       ON CONFLICT (user_id) DO UPDATE
         SET current_streak =
               GREATEST(0, routine_streaks.current_streak + $2::int),
             longest_streak =
               GREATEST(
                 routine_streaks.longest_streak,
                 GREATEST(0, routine_streaks.current_streak + $2::int)
               )`,
      [userId, delta],
    );
    return { status: "applied" };
  }

  const lwwGuard = await client.query<{ max_ts: Date | null }>(
    `SELECT MAX(client_ts) AS max_ts
       FROM sync_op_log
      WHERE user_id = $1
        AND table_name = 'routine_streaks'
        AND status = 'applied'
        AND op <> 'increment'`,
    [userId],
  );
  if (
    lwwGuard!.rows[0]!.max_ts &&
    lwwGuard!.rows[0]!.max_ts.getTime() >= clientTs.getTime()
  ) {
    return { status: "rejected", reason: "lww_conflict" };
  }

  if (op.op === "delete") {
    await client.query(`DELETE FROM routine_streaks WHERE user_id = $1`, [
      userId,
    ]);
    return { status: "applied" };
  }

  const currentStreak = toNonNegativeInt(row["current_streak"]) ?? 0;
  const longestStreak = toNonNegativeInt(row["longest_streak"]) ?? 0;
  const lastCompletedAt = parseOptionalDate(row["last_completed_at"]);
  if (lastCompletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_last_completed_at" };
  }

  await client.query(
    `INSERT INTO routine_streaks
       (user_id, current_streak, longest_streak, last_completed_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE
       SET current_streak = EXCLUDED.current_streak,
           longest_streak = EXCLUDED.longest_streak,
           last_completed_at = EXCLUDED.last_completed_at`,
    [userId, currentStreak, longestStreak, lastCompletedAt ?? null],
  );
  return { status: "applied" };
}

function parseOptionalDate(value: unknown): Date | null | "invalid" {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "invalid" : value;
  }
  if (typeof value !== "string") return "invalid";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

function parseRequiredDate(value: unknown): Date | "invalid" {
  if (value == null) return "invalid";
  const parsed = parseOptionalDate(value);
  if (parsed === null) return "invalid";
  return parsed;
}

function toNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return Math.floor(value);
}

function parseOptionalNumber(value: unknown): number | null | "invalid" {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : "invalid";
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : "invalid";
  }
  return "invalid";
}

function parseOptionalInt(value: unknown): number | null | "invalid" {
  const n = parseOptionalNumber(value);
  if (n === "invalid") return "invalid";
  if (n === null) return null;
  return Math.floor(n);
}

/**
 * Serialize a JSONB-bound value before binding to a `pg` parameter.
 *
 * Why an explicit helper: `pg` will silently coerce a JS object to its
 * default `toString()` form when bound to a `JSONB` column with the
 * default OID inference, producing `"[object Object]"`. Passing
 * `JSON.stringify(value)` forces the string path, which Postgres parses
 * as `JSONB`. `null`/`undefined` short-circuit so the column gets a
 * proper SQL NULL.
 */
function toJsonbParam(value: unknown): string | null {
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Fizruk apply-функції — Stage 4 PR #029.
//
// 5 split-функцій (по одній на таблицю), щоб LWW-guard, soft-delete і
// FK-семантика лишались такі ж як у `applyRoutineEntries`. Усі
// `fizruk_*` таблиці мають shape:
//
//   id UUID PK, user_id TEXT FK("user".id), …, created_at, updated_at,
//   deleted_at TIMESTAMPTZ.
//
// Per-row LWW: existing.updated_at < clientTs. Cross-user — fk_violation.
// Soft-delete — UPDATE deleted_at = clientTs (як і routine).
// FK-violation на parent (workout_id / workout_item_id) ловиться у
// SAVEPOINT-і `syncV2Push`-у і повертається як `apply_failed` — клієнт
// повинен спочатку синхронізувати parent-row, потім child-row.
// ---------------------------------------------------------------------

/**
 * Apply-шлях для `fizruk_workouts`. Per-row UPSERT за UUID PK.
 *
 * `groups_json` / `warmup_json` / `cooldown_json` / `wellbeing_json` —
 * JSONB колонки, серіалізуються через `toJsonbParam`. `groups_json`
 * за замовчуванням `[]`, інші JSON-колонки nullable.
 */
async function applyFizrukWorkouts(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  if (row["user_id"] != null && row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{
    user_id: string;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT user_id, updated_at, deleted_at FROM fizruk_workouts WHERE id = $1`,
    [id],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    // Tombstone-resurrection guard (PR #043 шаблон) — після soft-delete
    // не дозволяємо `op='insert'`/`op='update'` воскресити ряд.
    if (existing!.rows[0]!.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    await client.query(
      `UPDATE fizruk_workouts
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const startedAt = parseRequiredDate(row["started_at"]);
  if (startedAt === "invalid") {
    return { status: "rejected", reason: "invalid_started_at" };
  }
  const endedAt = parseOptionalDate(row["ended_at"]);
  if (endedAt === "invalid") {
    return { status: "rejected", reason: "invalid_ended_at" };
  }
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  const note = typeof row["note"] === "string" ? row["note"] : "";

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO fizruk_workouts
         (id, user_id, started_at, ended_at, note,
          groups_json, warmup_json, cooldown_json, wellbeing_json,
          created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5,
               COALESCE($6::jsonb, '[]'::jsonb), $7, $8, $9,
               $10, $11, $12)`,
      [
        id,
        userId,
        startedAt,
        endedAt ?? null,
        note,
        toJsonbParam(row["groups_json"]),
        toJsonbParam(row["warmup_json"]),
        toJsonbParam(row["cooldown_json"]),
        toJsonbParam(row["wellbeing_json"]),
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE fizruk_workouts
         SET started_at      = $1,
             ended_at        = $2,
             note            = $3,
             groups_json     = COALESCE($4::jsonb, '[]'::jsonb),
             warmup_json     = $5,
             cooldown_json   = $6,
             wellbeing_json  = $7,
             updated_at      = $8,
             deleted_at      = $9
       WHERE id = $10 AND user_id = $11`,
      [
        startedAt,
        endedAt ?? null,
        note,
        toJsonbParam(row["groups_json"]),
        toJsonbParam(row["warmup_json"]),
        toJsonbParam(row["cooldown_json"]),
        toJsonbParam(row["wellbeing_json"]),
        clientTs,
        deletedAt ?? null,
        id,
        userId,
      ],
    );
  }
  return { status: "applied" };
}

/**
 * Apply-шлях для `fizruk_workout_items`. FK на `fizruk_workouts.id`
 * — порушення ловиться SAVEPOINT-ом і повертається як `apply_failed`,
 * клієнт реплеїть parent-row перед child.
 */
async function applyFizrukItems(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  if (row["user_id"] != null && row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{
    user_id: string;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT user_id, updated_at, deleted_at FROM fizruk_workout_items WHERE id = $1`,
    [id],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    // Tombstone-resurrection guard (PR #043 шаблон).
    if (existing!.rows[0]!.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    await client.query(
      `UPDATE fizruk_workout_items
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const workoutId =
    typeof row["workout_id"] === "string" ? row["workout_id"] : null;
  if (!workoutId) {
    return { status: "rejected", reason: "missing_workout_id" };
  }
  const exerciseId =
    typeof row["exercise_id"] === "string" ? row["exercise_id"] : null;
  if (!exerciseId) {
    return { status: "rejected", reason: "missing_exercise_id" };
  }
  const nameUk = typeof row["name_uk"] === "string" ? row["name_uk"] : null;
  if (nameUk === null) {
    return { status: "rejected", reason: "missing_name_uk" };
  }
  const primaryGroup =
    typeof row["primary_group"] === "string" ? row["primary_group"] : "";
  const type = typeof row["type"] === "string" ? row["type"] : "strength";
  const sortOrder = toNonNegativeInt(row["sort_order"]) ?? 0;
  const durationSec = parseOptionalInt(row["duration_sec"]);
  if (durationSec === "invalid") {
    return { status: "rejected", reason: "invalid_duration_sec" };
  }
  const distanceM = parseOptionalInt(row["distance_m"]);
  if (distanceM === "invalid") {
    return { status: "rejected", reason: "invalid_distance_m" };
  }
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO fizruk_workout_items
         (id, workout_id, user_id, exercise_id, name_uk, primary_group,
          muscles_primary, muscles_secondary, type,
          duration_sec, distance_m, sort_order,
          created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6,
               COALESCE($7::jsonb, '[]'::jsonb),
               COALESCE($8::jsonb, '[]'::jsonb),
               $9, $10, $11, $12, $13, $14, $15)`,
      [
        id,
        workoutId,
        userId,
        exerciseId,
        nameUk,
        primaryGroup,
        toJsonbParam(row["muscles_primary"]),
        toJsonbParam(row["muscles_secondary"]),
        type,
        durationSec ?? null,
        distanceM ?? null,
        sortOrder,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE fizruk_workout_items
         SET workout_id        = $1,
             exercise_id       = $2,
             name_uk           = $3,
             primary_group     = $4,
             muscles_primary   = COALESCE($5::jsonb, '[]'::jsonb),
             muscles_secondary = COALESCE($6::jsonb, '[]'::jsonb),
             type              = $7,
             duration_sec      = $8,
             distance_m        = $9,
             sort_order        = $10,
             updated_at        = $11,
             deleted_at        = $12
       WHERE id = $13 AND user_id = $14`,
      [
        workoutId,
        exerciseId,
        nameUk,
        primaryGroup,
        toJsonbParam(row["muscles_primary"]),
        toJsonbParam(row["muscles_secondary"]),
        type,
        durationSec ?? null,
        distanceM ?? null,
        sortOrder,
        clientTs,
        deletedAt ?? null,
        id,
        userId,
      ],
    );
  }
  return { status: "applied" };
}

/**
 * Apply-шлях для `fizruk_workout_sets`. FK на
 * `fizruk_workout_items.id` — порушення ловиться SAVEPOINT-ом.
 */
async function applyFizrukSets(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  if (row["user_id"] != null && row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{
    user_id: string;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT user_id, updated_at, deleted_at FROM fizruk_workout_sets WHERE id = $1`,
    [id],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    // Tombstone-resurrection guard (PR #043 шаблон).
    if (existing!.rows[0]!.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    await client.query(
      `UPDATE fizruk_workout_sets
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const workoutItemId =
    typeof row["workout_item_id"] === "string" ? row["workout_item_id"] : null;
  if (!workoutItemId) {
    return { status: "rejected", reason: "missing_workout_item_id" };
  }
  const weightKg = parseOptionalNumber(row["weight_kg"]);
  if (weightKg === "invalid") {
    return { status: "rejected", reason: "invalid_weight_kg" };
  }
  const reps = parseOptionalInt(row["reps"]);
  if (reps === "invalid") {
    return { status: "rejected", reason: "invalid_reps" };
  }
  const rpe = parseOptionalNumber(row["rpe"]);
  if (rpe === "invalid") {
    return { status: "rejected", reason: "invalid_rpe" };
  }
  const sortOrder = toNonNegativeInt(row["sort_order"]) ?? 0;
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO fizruk_workout_sets
         (id, workout_item_id, user_id, weight_kg, reps, rpe,
          sort_order, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        workoutItemId,
        userId,
        weightKg ?? 0,
        reps ?? 0,
        rpe ?? null,
        sortOrder,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE fizruk_workout_sets
         SET workout_item_id = $1,
             weight_kg       = $2,
             reps            = $3,
             rpe             = $4,
             sort_order      = $5,
             updated_at      = $6,
             deleted_at      = $7
       WHERE id = $8 AND user_id = $9`,
      [
        workoutItemId,
        weightKg ?? 0,
        reps ?? 0,
        rpe ?? null,
        sortOrder,
        clientTs,
        deletedAt ?? null,
        id,
        userId,
      ],
    );
  }
  return { status: "applied" };
}

/**
 * Apply-шлях для `fizruk_custom_exercises`. JSONB-blob у `data_json`
 * містить повний exercise definition (name, muscles, equipment, …).
 */
async function applyFizrukCustomExercises(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  if (row["user_id"] != null && row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{
    user_id: string;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT user_id, updated_at, deleted_at FROM fizruk_custom_exercises WHERE id = $1`,
    [id],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    // Tombstone-resurrection guard (PR #043 шаблон).
    if (existing!.rows[0]!.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    await client.query(
      `UPDATE fizruk_custom_exercises
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const dataJson = toJsonbParam(row["data_json"]);
  if (dataJson === null) {
    return { status: "rejected", reason: "missing_data_json" };
  }
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO fizruk_custom_exercises
         (id, user_id, data_json, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
      [
        id,
        userId,
        dataJson,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE fizruk_custom_exercises
         SET data_json  = $1::jsonb,
             updated_at = $2,
             deleted_at = $3
       WHERE id = $4 AND user_id = $5`,
      [dataJson, clientTs, deletedAt ?? null, id, userId],
    );
  }
  return { status: "applied" };
}

/**
 * Apply-шлях для `fizruk_measurements`. Per-row UPSERT — числові
 * метрики (weight_kg, обхвати, sleep, energy, mood) опціональні.
 */
async function applyFizrukMeasurements(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  if (row["user_id"] != null && row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{
    user_id: string;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT user_id, updated_at, deleted_at FROM fizruk_measurements WHERE id = $1`,
    [id],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    // Tombstone-resurrection guard (PR #043 шаблон).
    if (existing!.rows[0]!.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    await client.query(
      `UPDATE fizruk_measurements
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const measuredAt = parseRequiredDate(row["measured_at"]);
  if (measuredAt === "invalid") {
    return { status: "rejected", reason: "invalid_measured_at" };
  }
  const weightKg = parseOptionalNumber(row["weight_kg"]);
  if (weightKg === "invalid") {
    return { status: "rejected", reason: "invalid_weight_kg" };
  }
  const waistCm = parseOptionalNumber(row["waist_cm"]);
  if (waistCm === "invalid") {
    return { status: "rejected", reason: "invalid_waist_cm" };
  }
  const chestCm = parseOptionalNumber(row["chest_cm"]);
  if (chestCm === "invalid") {
    return { status: "rejected", reason: "invalid_chest_cm" };
  }
  const hipsCm = parseOptionalNumber(row["hips_cm"]);
  if (hipsCm === "invalid") {
    return { status: "rejected", reason: "invalid_hips_cm" };
  }
  const bicepCm = parseOptionalNumber(row["bicep_cm"]);
  if (bicepCm === "invalid") {
    return { status: "rejected", reason: "invalid_bicep_cm" };
  }
  const sleepHours = parseOptionalNumber(row["sleep_hours"]);
  if (sleepHours === "invalid") {
    return { status: "rejected", reason: "invalid_sleep_hours" };
  }
  const energyLevel = parseOptionalInt(row["energy_level"]);
  if (energyLevel === "invalid") {
    return { status: "rejected", reason: "invalid_energy_level" };
  }
  const mood = parseOptionalInt(row["mood"]);
  if (mood === "invalid") {
    return { status: "rejected", reason: "invalid_mood" };
  }
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO fizruk_measurements
         (id, user_id, measured_at, weight_kg, waist_cm, chest_cm,
          hips_cm, bicep_cm, sleep_hours, energy_level, mood,
          created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               $12, $13, $14)`,
      [
        id,
        userId,
        measuredAt,
        weightKg ?? null,
        waistCm ?? null,
        chestCm ?? null,
        hipsCm ?? null,
        bicepCm ?? null,
        sleepHours ?? null,
        energyLevel ?? null,
        mood ?? null,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE fizruk_measurements
         SET measured_at  = $1,
             weight_kg    = $2,
             waist_cm     = $3,
             chest_cm     = $4,
             hips_cm      = $5,
             bicep_cm     = $6,
             sleep_hours  = $7,
             energy_level = $8,
             mood         = $9,
             updated_at   = $10,
             deleted_at   = $11
       WHERE id = $12 AND user_id = $13`,
      [
        measuredAt,
        weightKg ?? null,
        waistCm ?? null,
        chestCm ?? null,
        hipsCm ?? null,
        bicepCm ?? null,
        sleepHours ?? null,
        energyLevel ?? null,
        mood ?? null,
        clientTs,
        deletedAt ?? null,
        id,
        userId,
      ],
    );
  }
  return { status: "applied" };
}

// ---------------------------------------------------------------------
// Nutrition apply-функції — Stage 4 PR #031.
//
// 5 split-функцій (по одній на таблицю). LWW-guard, soft-delete і
// FK-семантика ідентичні fizruk-у. Таблиці:
//
//   nutrition_meals       — per-row meal log with soft-delete
//   nutrition_pantries    — per-user pantry containers with soft-delete
//   nutrition_pantry_items — items within a pantry (FK pantry_id)
//   nutrition_prefs       — singleton per-user (user_id PK), no soft-delete
//   nutrition_recipes     — saved recipes with soft-delete
// ---------------------------------------------------------------------

/**
 * Apply-шлях для `nutrition_meals`. Per-row UPSERT за UUID PK.
 *
 * Stage 5 / PR #043: формалізовано як **G-set CRDT з tombstone-ами +
 * per-row LWW** (`docs/planning/storage-roadmap.md`):
 *
 *   * **G-set (grow-only set):** ряд із новим `id` додається через
 *     `op='insert'`. Конкурентні insert-и із різних девайсів конвергують
 *     природним чином — різні `id` сумарно дають об'єднання, той самий
 *     `id` із різними `idempotency_key` зливаються через LWW по
 *     `updated_at`/`client_ts`.
 *   * **Tombstone (deleted_at):** видалення — це монотонне додавання
 *     tombstone-а. Раз rt = `deleted_at IS NOT NULL`, ряд лишається
 *     tombstoned **назавжди** — жоден `op='insert'`/`op='update'` його
 *     не воскрешає (повертаємо `reason='tombstoned'`). Це load-bearing
 *     для multi-device convergence: інакше offline-edit на одному
 *     девайсі скасовував би delete на іншому.
 *   * **Idempotent delete:** повторний `op='delete'` на вже tombstoned-у
 *     ряд проходить (re-stamp-ить `deleted_at` новішим `client_ts`),
 *     щоб LWW-cursor pull-у не "забував" про event після того, як
 *     інший девайс перепідсиле delete з новішим часом.
 *
 * Macro columns (`kcal`, `protein_g`, `fat_g`, `carbs_g`) optional
 * integers/reals. `eaten_at` is REQUIRED (TIMESTAMPTZ).
 */
async function applyNutritionMeals(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  if (row["user_id"] != null && row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{
    user_id: string;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT user_id, updated_at, deleted_at FROM nutrition_meals WHERE id = $1`,
    [id],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    // G-set CRDT invariant: tombstone-и монотонні. `op='insert'`
    // або `op='update'` проти вже tombstoned-у ряд — це або
    // resurrection-attack (зловмисний клієнт), або race з offline
    // editor-ом, що не побачив delete з іншого девайсу. Обидва — no-op,
    // повертаємо явну `tombstoned` причину для observability.
    if (existing!.rows[0]!.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    await client.query(
      `UPDATE nutrition_meals
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const eatenAt = parseRequiredDate(row["eaten_at"]);
  if (eatenAt === "invalid") {
    return { status: "rejected", reason: "invalid_eaten_at" };
  }
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  const mealType =
    typeof row["meal_type"] === "string" ? row["meal_type"] : "snack";
  const name = typeof row["name"] === "string" ? row["name"] : "";
  const label = typeof row["label"] === "string" ? row["label"] : "";
  const source = typeof row["source"] === "string" ? row["source"] : "manual";
  const macroSource =
    typeof row["macro_source"] === "string" ? row["macro_source"] : "manual";
  const foodId = typeof row["food_id"] === "string" ? row["food_id"] : null;
  const isDemo = row["is_demo"] === true || row["is_demo"] === 1;

  const kcal = parseOptionalInt(row["kcal"]);
  if (kcal === "invalid") {
    return { status: "rejected", reason: "invalid_kcal" };
  }
  const proteinG = parseOptionalNumber(row["protein_g"]);
  if (proteinG === "invalid") {
    return { status: "rejected", reason: "invalid_protein_g" };
  }
  const fatG = parseOptionalNumber(row["fat_g"]);
  if (fatG === "invalid") {
    return { status: "rejected", reason: "invalid_fat_g" };
  }
  const carbsG = parseOptionalNumber(row["carbs_g"]);
  if (carbsG === "invalid") {
    return { status: "rejected", reason: "invalid_carbs_g" };
  }
  const amountG = parseOptionalNumber(row["amount_g"]);
  if (amountG === "invalid") {
    return { status: "rejected", reason: "invalid_amount_g" };
  }

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO nutrition_meals
         (id, user_id, eaten_at, meal_type, name, label,
          kcal, protein_g, fat_g, carbs_g,
          source, macro_source, amount_g, food_id, is_demo,
          created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6,
               $7, $8, $9, $10,
               $11, $12, $13, $14, $15,
               $16, $17, $18)`,
      [
        id,
        userId,
        eatenAt,
        mealType,
        name,
        label,
        kcal ?? null,
        proteinG ?? null,
        fatG ?? null,
        carbsG ?? null,
        source,
        macroSource,
        amountG ?? null,
        foodId,
        isDemo,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE nutrition_meals
         SET eaten_at     = $1,
             meal_type    = $2,
             name         = $3,
             label        = $4,
             kcal         = $5,
             protein_g    = $6,
             fat_g        = $7,
             carbs_g      = $8,
             source       = $9,
             macro_source = $10,
             amount_g     = $11,
             food_id      = $12,
             is_demo      = $13,
             updated_at   = $14,
             deleted_at   = $15
       WHERE id = $16 AND user_id = $17`,
      [
        eatenAt,
        mealType,
        name,
        label,
        kcal ?? null,
        proteinG ?? null,
        fatG ?? null,
        carbsG ?? null,
        source,
        macroSource,
        amountG ?? null,
        foodId,
        isDemo,
        clientTs,
        deletedAt ?? null,
        id,
        userId,
      ],
    );
  }
  return { status: "applied" };
}

/**
 * Apply-шлях для `nutrition_pantries`. Per-user containers with
 * soft-delete. `name` і `text` — TEXT, обидва NOT NULL з default ''.
 */
async function applyNutritionPantries(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  if (row["user_id"] != null && row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{
    user_id: string;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT user_id, updated_at, deleted_at FROM nutrition_pantries WHERE id = $1`,
    [id],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    // Tombstone-resurrection guard — див. PR #043 (`applyNutritionMeals`).
    if (existing!.rows[0]!.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    await client.query(
      `UPDATE nutrition_pantries
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const name = typeof row["name"] === "string" ? row["name"] : "";
  const text = typeof row["text"] === "string" ? row["text"] : "";
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO nutrition_pantries
         (id, user_id, name, text, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        userId,
        name,
        text,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE nutrition_pantries
         SET name       = $1,
             text       = $2,
             updated_at = $3,
             deleted_at = $4
       WHERE id = $5 AND user_id = $6`,
      [name, text, clientTs, deletedAt ?? null, id, userId],
    );
  }
  return { status: "applied" };
}

/**
 * Apply-шлях для `nutrition_pantry_items`. FK на
 * `nutrition_pantries.id` — порушення ловиться SAVEPOINT-ом.
 */
async function applyNutritionPantryItems(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  if (row["user_id"] != null && row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{
    user_id: string;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT user_id, updated_at, deleted_at FROM nutrition_pantry_items WHERE id = $1`,
    [id],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    // Tombstone-resurrection guard — див. PR #043 (`applyNutritionMeals`).
    if (existing!.rows[0]!.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    await client.query(
      `UPDATE nutrition_pantry_items
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const pantryId =
    typeof row["pantry_id"] === "string" ? row["pantry_id"] : null;
  if (!pantryId) {
    return { status: "rejected", reason: "missing_pantry_id" };
  }
  const name = typeof row["name"] === "string" ? row["name"] : "";
  const qty = parseOptionalNumber(row["qty"]);
  if (qty === "invalid") {
    return { status: "rejected", reason: "invalid_qty" };
  }
  const unit = typeof row["unit"] === "string" ? row["unit"] : null;
  const notes = typeof row["notes"] === "string" ? row["notes"] : null;
  const sortOrder = toNonNegativeInt(row["sort_order"]) ?? 0;
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO nutrition_pantry_items
         (id, pantry_id, user_id, name, qty, unit, notes, sort_order,
          created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        pantryId,
        userId,
        name,
        qty ?? null,
        unit,
        notes,
        sortOrder,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE nutrition_pantry_items
         SET pantry_id  = $1,
             name       = $2,
             qty        = $3,
             unit       = $4,
             notes      = $5,
             sort_order = $6,
             updated_at = $7,
             deleted_at = $8
       WHERE id = $9 AND user_id = $10`,
      [
        pantryId,
        name,
        qty ?? null,
        unit,
        notes,
        sortOrder,
        clientTs,
        deletedAt ?? null,
        id,
        userId,
      ],
    );
  }
  return { status: "applied" };
}

/**
 * Apply-шлях для `nutrition_prefs`. Singleton per-user (PK = user_id).
 *
 * Відмінності від інших таблиць:
 *  - Немає `id` UUID — PK це `user_id`.
 *  - Немає `deleted_at` — singleton не видаляється, тільки оновлюється.
 *  - `delete` op відхиляється.
 *  - `prefs_json` — JSONB, серіалізується через `toJsonbParam`.
 */
async function applyNutritionPrefs(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  if (op.op === "delete") {
    return { status: "rejected", reason: "delete_not_supported" };
  }

  const row = op.row;

  if (row["user_id"] != null && row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{ user_id: string; updated_at: Date }>(
    `SELECT user_id, updated_at FROM nutrition_prefs WHERE user_id = $1`,
    [userId],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
  }

  const prefsJson = toJsonbParam(row["prefs_json"]) ?? "{}";
  const activePantryId =
    typeof row["active_pantry_id"] === "string"
      ? row["active_pantry_id"]
      : null;

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO nutrition_prefs
         (user_id, prefs_json, active_pantry_id, created_at, updated_at)
       VALUES ($1, $2::jsonb, $3, $4, $5)`,
      [userId, prefsJson, activePantryId, clientTs, clientTs],
    );
  } else {
    await client.query(
      `UPDATE nutrition_prefs
         SET prefs_json       = $1::jsonb,
             active_pantry_id = $2,
             updated_at       = $3
       WHERE user_id = $4`,
      [prefsJson, activePantryId, clientTs, userId],
    );
  }
  return { status: "applied" };
}

/**
 * Apply-шлях для `nutrition_recipes`. Per-row UPSERT за UUID PK.
 * `data_json` — JSONB blob з повним рецептом. `name` — TEXT.
 */
async function applyNutritionRecipes(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  if (row["user_id"] != null && row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{
    user_id: string;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT user_id, updated_at, deleted_at FROM nutrition_recipes WHERE id = $1`,
    [id],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    // Tombstone-resurrection guard — див. PR #043 (`applyNutritionMeals`).
    if (existing!.rows[0]!.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    await client.query(
      `UPDATE nutrition_recipes
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const name = typeof row["name"] === "string" ? row["name"] : "";
  const dataJson = toJsonbParam(row["data_json"]);
  if (dataJson === null) {
    return { status: "rejected", reason: "missing_data_json" };
  }
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO nutrition_recipes
         (id, user_id, name, data_json, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
      [
        id,
        userId,
        name,
        dataJson,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE nutrition_recipes
         SET name       = $1,
             data_json  = $2::jsonb,
             updated_at = $3,
             deleted_at = $4
       WHERE id = $5 AND user_id = $6`,
      [name, dataJson, clientTs, deletedAt ?? null, id, userId],
    );
  }
  return { status: "applied" };
}

// ---------------------------------------------------------------------
// Finyk apply-функції — Stage 4 PR #035.
//
// 15 split-функцій по таблицях. Архітектурно повторюють nutrition та
// fizruk: кожна функція робить LWW-guard, розрізняє op `delete` /
// upsert, оперує `(user_id, …)` ключем і повертає `applied`/`rejected`
// з причиною (`lww_conflict`, `missing_id`, `user_id_mismatch`,
// `fk_violation`, `not_found`).
//
// Розподіл за shape-ами (див. коментар у міграції 039_finyk_tables.sql):
//
//   * **Composite-PK tombstone** (per-(user, ext_id) запис із soft-delete):
//     - `finyk_hidden_accounts`        — ext_id = account_id
//     - `finyk_hidden_transactions`    — ext_id = transaction_id
//
//   * **Per-row + JSONB blob** (UUID PK, soft-delete):
//     - `finyk_budgets`, `finyk_subscriptions`, `finyk_assets`,
//       `finyk_debts`, `finyk_receivables`,
//       `finyk_custom_categories`, `finyk_manual_expenses`,
//       `finyk_tx_filters`
//
//   * **Per-tx mapping** (composite PK на (user_id, transaction_id),
//     без soft-delete — `delete` = жорсткий `DELETE FROM`):
//     - `finyk_tx_categories` — поле `category_id TEXT`
//     - `finyk_tx_splits`     — поле `splits_json JSONB`
//     - `finyk_mono_debt_links` — поле `debt_ids_json JSONB`
//
//   * **Time-series** (`finyk_networth_history`): composite PK
//     `(user_id, month)`; `month` — TEXT YYYY-MM.
//
//   * **Singleton prefs** (`finyk_prefs`): PK = `user_id`. `delete`
//     відхиляється, тільки оновлення.
// ---------------------------------------------------------------------

/**
 * Generic helper for "composite-PK tombstone" finyk таблиць:
 * `finyk_hidden_accounts` (ext column = account_id) і
 * `finyk_hidden_transactions` (ext column = transaction_id). Уся
 * apply-логіка ідентична — різняться лише імена колонки і таблиці.
 */
async function applyFinykTombstone(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
  table: "finyk_hidden_accounts" | "finyk_hidden_transactions",
  extColumn: "account_id" | "transaction_id",
): Promise<AppliedStatus> {
  const row = op.row;
  const extId = typeof row[extColumn] === "string" ? row[extColumn] : null;
  if (!extId) return { status: "rejected", reason: "missing_ext_id" };

  if (row["user_id"] != null && row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  // eslint-disable-next-line no-restricted-syntax -- M11 documented exception (docs/security/audit-exceptions.md): typed dynamic upsert engine, `${table}` / `${extColumn}` from typed apply-fn allowlist, values via $N.
  const existing = await client.query<{
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT updated_at, deleted_at FROM ${table} WHERE user_id = $1 AND ${extColumn} = $2`,
    [userId, extId],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    // Tombstone-resurrection guard — див. PR #043 (`applyNutritionMeals`).
    if (existing!.rows[0]!.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    // eslint-disable-next-line no-restricted-syntax -- M11 documented exception (docs/security/audit-exceptions.md): typed dynamic upsert engine, `${table}` / `${extColumn}` from typed apply-fn allowlist, values via $N.
    await client.query(
      `UPDATE ${table}
         SET deleted_at = $1, updated_at = $1
       WHERE user_id = $2 AND ${extColumn} = $3`,
      [clientTs, userId, extId],
    );
    return { status: "applied" };
  }

  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  if (existing.rows.length === 0) {
    // eslint-disable-next-line no-restricted-syntax -- M11 documented exception (docs/security/audit-exceptions.md): typed dynamic upsert engine, `${table}` / `${extColumn}` from typed apply-fn allowlist, values via $N.
    await client.query(
      `INSERT INTO ${table}
         (user_id, ${extColumn}, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, extId, createdAt ?? clientTs, clientTs, deletedAt ?? null],
    );
  } else {
    // eslint-disable-next-line no-restricted-syntax -- M11 documented exception (docs/security/audit-exceptions.md): typed dynamic upsert engine, `${table}` / `${extColumn}` from typed apply-fn allowlist, values via $N.
    await client.query(
      `UPDATE ${table}
         SET updated_at = $1, deleted_at = $2
       WHERE user_id = $3 AND ${extColumn} = $4`,
      [clientTs, deletedAt ?? null, userId, extId],
    );
  }
  return { status: "applied" };
}

async function applyFinykHiddenAccounts(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykTombstone(
    client,
    op,
    userId,
    clientTs,
    "finyk_hidden_accounts",
    "account_id",
  );
}

async function applyFinykHiddenTransactions(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykTombstone(
    client,
    op,
    userId,
    clientTs,
    "finyk_hidden_transactions",
    "transaction_id",
  );
}

/**
 * Generic helper for "per-row + JSONB blob" finyk таблиць
 * (`finyk_budgets`, `finyk_subscriptions`, `finyk_assets`,
 * `finyk_debts`, `finyk_receivables`, `finyk_custom_categories`,
 * `finyk_manual_expenses`, `finyk_tx_filters`). Ідентична семантика —
 * лише ім'я таблиці змінюється. Колонки фіксовані: `(id UUID PK,
 * user_id, data_json JSONB, created_at, updated_at, deleted_at)`.
 */
async function applyFinykPerRowBlob(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
  table: string,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  if (row["user_id"] != null && row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  // eslint-disable-next-line no-restricted-syntax -- M11 documented exception (docs/security/audit-exceptions.md): typed dynamic upsert engine, `${table}` from typed apply-fn allowlist, values via $N.
  const existing = await client.query<{
    user_id: string;
    updated_at: Date;
    deleted_at: Date | null;
  }>(`SELECT user_id, updated_at, deleted_at FROM ${table} WHERE id = $1`, [
    id,
  ]);
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    // Tombstone-resurrection guard — див. PR #043 (`applyNutritionMeals`).
    if (existing!.rows[0]!.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    // eslint-disable-next-line no-restricted-syntax -- M11 documented exception (docs/security/audit-exceptions.md): typed dynamic upsert engine, `${table}` from typed apply-fn allowlist, values via $N.
    await client.query(
      `UPDATE ${table}
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const dataJson = toJsonbParam(row["data_json"]);
  if (dataJson === null) {
    return { status: "rejected", reason: "missing_data_json" };
  }
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  if (existing.rows.length === 0) {
    // eslint-disable-next-line no-restricted-syntax -- M11 documented exception (docs/security/audit-exceptions.md): typed dynamic upsert engine, `${table}` from typed apply-fn allowlist, values via $N.
    await client.query(
      `INSERT INTO ${table}
         (id, user_id, data_json, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
      [
        id,
        userId,
        dataJson,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    // eslint-disable-next-line no-restricted-syntax -- M11 documented exception (docs/security/audit-exceptions.md): typed dynamic upsert engine, `${table}` from typed apply-fn allowlist, values via $N.
    await client.query(
      `UPDATE ${table}
         SET data_json  = $1::jsonb,
             updated_at = $2,
             deleted_at = $3
       WHERE id = $4 AND user_id = $5`,
      [dataJson, clientTs, deletedAt ?? null, id, userId],
    );
  }
  return { status: "applied" };
}

async function applyFinykBudgets(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerRowBlob(client, op, userId, clientTs, "finyk_budgets");
}

async function applyFinykSubscriptions(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerRowBlob(
    client,
    op,
    userId,
    clientTs,
    "finyk_subscriptions",
  );
}

async function applyFinykAssets(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerRowBlob(client, op, userId, clientTs, "finyk_assets");
}

async function applyFinykDebts(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerRowBlob(client, op, userId, clientTs, "finyk_debts");
}

async function applyFinykReceivables(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerRowBlob(
    client,
    op,
    userId,
    clientTs,
    "finyk_receivables",
  );
}

async function applyFinykCustomCategories(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerRowBlob(
    client,
    op,
    userId,
    clientTs,
    "finyk_custom_categories",
  );
}

async function applyFinykManualExpenses(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerRowBlob(
    client,
    op,
    userId,
    clientTs,
    "finyk_manual_expenses",
  );
}

async function applyFinykTxFilters(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerRowBlob(client, op, userId, clientTs, "finyk_tx_filters");
}

/**
 * Apply-шлях для `finyk_tx_categories` — per-tx mapping без
 * soft-delete. `delete` op виконує `DELETE FROM` (idempotent).
 */
async function applyFinykTxCategories(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const transactionId =
    typeof row["transaction_id"] === "string" ? row["transaction_id"] : null;
  if (!transactionId) return { status: "rejected", reason: "missing_tx_id" };

  if (row["user_id"] != null && row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{ updated_at: Date }>(
    `SELECT updated_at FROM finyk_tx_categories
       WHERE user_id = $1 AND transaction_id = $2`,
    [userId, transactionId],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
  }

  if (op.op === "delete") {
    await client.query(
      `DELETE FROM finyk_tx_categories
         WHERE user_id = $1 AND transaction_id = $2`,
      [userId, transactionId],
    );
    return { status: "applied" };
  }

  const categoryId =
    typeof row["category_id"] === "string" ? row["category_id"] : null;
  if (!categoryId) {
    return { status: "rejected", reason: "missing_category_id" };
  }

  await client.query(
    `INSERT INTO finyk_tx_categories
       (user_id, transaction_id, category_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, transaction_id) DO UPDATE
       SET category_id = EXCLUDED.category_id,
           updated_at  = EXCLUDED.updated_at`,
    [userId, transactionId, categoryId, clientTs, clientTs],
  );
  return { status: "applied" };
}

/**
 * Generic helper for `finyk_tx_splits` and `finyk_mono_debt_links` —
 * per-tx JSONB-array mapping (composite PK на `(user_id,
 * transaction_id)`, без soft-delete). Розрізняються лише ім'ям
 * таблиці і JSONB-колонки. Default fallback значення для відсутнього
 * payload-у — порожній масив `[]`.
 */
async function applyFinykPerTxJsonbArray(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
  table: "finyk_tx_splits" | "finyk_mono_debt_links",
  jsonColumn: "splits_json" | "debt_ids_json",
): Promise<AppliedStatus> {
  const row = op.row;
  const transactionId =
    typeof row["transaction_id"] === "string" ? row["transaction_id"] : null;
  if (!transactionId) return { status: "rejected", reason: "missing_tx_id" };

  if (row["user_id"] != null && row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  // eslint-disable-next-line no-restricted-syntax -- M11 documented exception (docs/security/audit-exceptions.md): typed dynamic upsert engine, `${table}` from typed apply-fn allowlist, values via $N.
  const existing = await client.query<{ updated_at: Date }>(
    `SELECT updated_at FROM ${table}
       WHERE user_id = $1 AND transaction_id = $2`,
    [userId, transactionId],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
  }

  if (op.op === "delete") {
    // eslint-disable-next-line no-restricted-syntax -- M11 documented exception (docs/security/audit-exceptions.md): typed dynamic upsert engine, `${table}` from typed apply-fn allowlist, values via $N.
    await client.query(
      `DELETE FROM ${table}
         WHERE user_id = $1 AND transaction_id = $2`,
      [userId, transactionId],
    );
    return { status: "applied" };
  }

  const jsonValue = toJsonbParam(row[jsonColumn]) ?? "[]";

  // eslint-disable-next-line no-restricted-syntax -- M11 documented exception (docs/security/audit-exceptions.md): typed dynamic upsert engine, `${table}` / `${jsonColumn}` from typed apply-fn allowlist, values via $N.
  await client.query(
    `INSERT INTO ${table}
       (user_id, transaction_id, ${jsonColumn}, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (user_id, transaction_id) DO UPDATE
       SET ${jsonColumn} = EXCLUDED.${jsonColumn},
           updated_at    = EXCLUDED.updated_at`,
    [userId, transactionId, jsonValue, clientTs, clientTs],
  );
  return { status: "applied" };
}

async function applyFinykTxSplits(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerTxJsonbArray(
    client,
    op,
    userId,
    clientTs,
    "finyk_tx_splits",
    "splits_json",
  );
}

async function applyFinykMonoDebtLinks(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerTxJsonbArray(
    client,
    op,
    userId,
    clientTs,
    "finyk_mono_debt_links",
    "debt_ids_json",
  );
}

/**
 * Apply-шлях для `finyk_networth_history` — time-series, composite
 * PK `(user_id, month)`. `month` — TEXT YYYY-MM (stored verbatim).
 */
async function applyFinykNetworthHistory(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const month = typeof row["month"] === "string" ? row["month"] : null;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return { status: "rejected", reason: "invalid_month" };
  }

  if (row["user_id"] != null && row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{ updated_at: Date }>(
    `SELECT updated_at FROM finyk_networth_history
       WHERE user_id = $1 AND month = $2`,
    [userId, month],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
  }

  if (op.op === "delete") {
    await client.query(
      `DELETE FROM finyk_networth_history
         WHERE user_id = $1 AND month = $2`,
      [userId, month],
    );
    return { status: "applied" };
  }

  const networth = parseOptionalNumber(row["networth"]);
  if (networth === "invalid") {
    return { status: "rejected", reason: "invalid_networth" };
  }
  const snapshotJson = toJsonbParam(row["snapshot_json"]) ?? "{}";

  await client.query(
    `INSERT INTO finyk_networth_history
       (user_id, month, networth, snapshot_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     ON CONFLICT (user_id, month) DO UPDATE
       SET networth      = EXCLUDED.networth,
           snapshot_json = EXCLUDED.snapshot_json,
           updated_at    = EXCLUDED.updated_at`,
    [userId, month, networth ?? 0, snapshotJson, clientTs, clientTs],
  );
  return { status: "applied" };
}

/**
 * Apply-шлях для `finyk_prefs` — singleton per-user (PK = user_id).
 *
 * Структурно дзеркало `applyNutritionPrefs`: `delete` відхиляється,
 * `prefs_json`/`monthly_plan_json`/`excluded_stat_tx_ids`/`dismissed_recurring`
 * серіалізуються через `toJsonbParam`, `show_balance` приходить як
 * boolean / 0|1. Stage 13 / PR #075 додав останні два масиви для
 * cross-device sync UI-фільтрів зі статистики та закритих recurring-
 * банерів.
 */
async function applyFinykPrefs(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  if (op.op === "delete") {
    return { status: "rejected", reason: "delete_not_supported" };
  }

  const row = op.row;
  if (row["user_id"] != null && row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{ updated_at: Date }>(
    `SELECT updated_at FROM finyk_prefs WHERE user_id = $1`,
    [userId],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
  }

  const prefsJson = toJsonbParam(row["prefs_json"]) ?? "{}";
  const monthlyPlanJson = toJsonbParam(row["monthly_plan_json"]) ?? "{}";
  const showBalance =
    row["show_balance"] === false || row["show_balance"] === 0 ? false : true;
  const excludedStatTxIds = toJsonbParam(row["excluded_stat_tx_ids"]) ?? "[]";
  const dismissedRecurring = toJsonbParam(row["dismissed_recurring"]) ?? "[]";

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO finyk_prefs
         (user_id, prefs_json, monthly_plan_json, show_balance,
          excluded_stat_tx_ids, dismissed_recurring,
          created_at, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5::jsonb, $6::jsonb, $7, $8)`,
      [
        userId,
        prefsJson,
        monthlyPlanJson,
        showBalance,
        excludedStatTxIds,
        dismissedRecurring,
        clientTs,
        clientTs,
      ],
    );
  } else {
    await client.query(
      `UPDATE finyk_prefs
         SET prefs_json           = $1::jsonb,
             monthly_plan_json    = $2::jsonb,
             show_balance         = $3,
             excluded_stat_tx_ids = $4::jsonb,
             dismissed_recurring  = $5::jsonb,
             updated_at           = $6
       WHERE user_id = $7`,
      [
        prefsJson,
        monthlyPlanJson,
        showBalance,
        excludedStatTxIds,
        dismissedRecurring,
        clientTs,
        userId,
      ],
    );
  }
  return { status: "applied" };
}

/**
 * `POST /api/v2/sync/push` — батч per-row ops у транзакції.
 *
 * Для кожної операції:
 *   1. Перевірити `(user_id, idempotency_key)` у `sync_op_log`. Якщо
 *      існує — додати кешований результат до response, не апплаїти.
 *   2. Перевірити clock-skew (`client_ts > now + 1h` → reject).
 *   3. Якщо `table` не у whitelist-і → reject з `table_not_allowed`.
 *   4. Викликати `applyXxx` усередині `SAVEPOINT`. На exception
 *      `ROLLBACK TO SAVEPOINT` повертає таблицю у стан до op-у; status
 *      = `rejected`, reason = `apply_failed`. На LWW-conflict apply-фн
 *      повертає `{status: 'rejected', reason: 'lww_conflict'}` без
 *      DML-у — savepoint rollback no-op-ить.
 *   5. INSERT у `sync_op_log` із фінальним status; повертає `id` для
 *      `last_op_id`.
 *
 * Усе йде в одній транзакції; на будь-яку catastrophic exception
 * (наприклад, DB-disconnect) — ROLLBACK і 500 через errorHandler.
 * Per-op rollback через savepoint-и НЕ скасовує `sync_op_log` insert
 * (savepoint обмежує тільки apply-шар).
 */
export async function syncV2Push(req: Request, res: Response): Promise<void> {
  const start = process.hrtime.bigint();
  const user = (req as WithSessionUser).user!;
  const originDeviceId = readOriginDeviceId(req);

  const parsed = validateBody(SyncV2PushSchema, req, res);
  if (!parsed.ok) {
    recordSyncV2("v2_push", "invalid", {
      ms: elapsedMs(start),
      userId: user.id,
    });
    return;
  }
  const { ops } = parsed.data;

  // bytes-метрика: serialized payload size. Тримаємо до COMMIT-а;
  // оригінальне `req.body` уже розпарсене.
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
  // Stage 5 / PR #041: applied ops accumulator — фен-аутиться в SSE
  // стрім після успішного COMMIT-у. Заповнюється тільки на щойно-
  // applied (НЕ на duplicate-replay), щоб клієнт не отримував double-
  // emit-у при offline-replay-і.
  const newlyAppliedForStream: SyncV2StreamOp[] = [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const op of ops) {
      // 1. Idempotency check.
      const dup = await client.query<SyncOpLogDuplicateRow>(
        `SELECT id, status, reject_reason
           FROM sync_op_log
          WHERE user_id = $1 AND idempotency_key = $2`,
        [user.id, op.idempotency_key],
      );
      if (dup.rows.length > 0) {
        const r = dup.rows[0];
        // Hard rule #1: BIGINT id → number.
        const id = Number(r!.id);
        if (id > lastOpId) lastOpId = id;
        // Кешований результат: повертаємо ОРИГІНАЛЬНИЙ status (applied
        // / rejected), а не "duplicate" — клієнту важливий ефект
        // first-write-у, а не той факт, що ми вже бачили цей ключ.
        // Метрика `outcome="partial"` все ще побачить це через
        // appliedCount/rejectedCount.
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
        // PR #048: per-op outcome counter. Idempotency-replay лічимо
        // окремим `status="duplicate"` — RED-dashboard відрізняє
        // first-write outcome від кешованих повторів.
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

      // 2. Validate client_ts vs server clock.
      const clientTs = new Date(op.client_ts);
      let status: "applied" | "rejected" = "applied";
      let reason: RejectReason | null = null;

      const skewMs = clientTs.getTime() - Date.now();
      if (skewMs > CLOCK_SKEW_FORWARD_MS) {
        status = "rejected";
        reason = "clock_skew";
      }

      // 3. Op-kind support gate (PR #042a).
      //    `increment` is the PN-counter primitive scaffolded for PR
      //    #042b; until per-table apply-fn-и навчаться його обробляти,
      //    engine відхиляє його тут — до whitelist-check-у і до
      //    SAVEPOINT, щоб ми не привезли його у DML випадково. Insert
      //    / update / delete завжди лишаються supported regardless of
      //    table — окремий per-row reject лишається на apply-fn.
      if (
        status === "applied" &&
        op.op === "increment" &&
        !INCREMENT_OP_SUPPORTED_TABLES.has(op.table)
      ) {
        status = "rejected";
        reason = "op_not_supported";
      }

      // 4. Whitelist check.
      const applyFn = OP_LOG_TABLE_REGISTRY[op.table];
      if (status === "applied" && !applyFn) {
        status = "rejected";
        reason = "table_not_allowed";
      }

      // 5. Apply усередині SAVEPOINT — щоб FK/unique-violation не
      //    poison-нув цілу транзакцію. На очікувані LWW-reject-и
      //    apply-fn просто повертає `{rejected, reason}` без DML.
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
            module: SYNC_V2_MODULE,
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

      // 6. INSERT у `sync_op_log`. ON CONFLICT не потрібен — idempotency-
      //    check вище вже відсіяв повтори; UNIQUE-constraint тут служить
      //    як остання сторожа на race з паралельним push-ем тієї ж
      //    сесії (PG поверне 23505 — ловиться як unhandled exception).
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

      // PR #048: per-op outcome counter (RED-stack — Errors). На
      // `applied` reason="none" (label-uniformity вимога prom-client-у);
      // на `rejected` пишемо реальну причину з зафіксованого набору в
      // syncV2.ts; `table_not_allowed` гілку маркуємо `__unknown__`,
      // щоб не "забруднити" cardinality невідомими user-input table-
      // іменами.
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

  // Stage 5 / PR #041: фен-аут applied-ops у SSE-стрім ПІСЛЯ COMMIT-у —
  // listener-и побачать тільки durable-зміни. На failed-COMMIT
  // (catch above) ми сюди не доходимо, тому ризику ghost-emit-а немає.
  notifySyncV2OpsApplied(user.id, newlyAppliedForStream);

  // Outcome класифікація: усі applied → ok; жодного applied →
  // conflict (всі ops відхилено); змішаний — partial.
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

/**
 * `GET /api/v2/sync/pull?since=<id>&limit=<int>` — cursor-based стрім
 * applied-ops іншого пристрою того ж юзера, починаючи з `id > since`.
 *
 * Заголовок `X-Origin-Device-Id` (опціональний) виключає ops з тим
 * самим device-id, щоб клієнт ніколи не реплеїв власні writes. Без
 * заголовка повертаємо всі applied-ops юзера.
 *
 * Повертаємо тільки `status='applied'` — реплейний клієнт не має
 * шансу побачити rejected/duplicate-маркери та зайти в нескінченний
 * цикл-резолв. План:
 *   Index Scan using sync_op_log_user_id_idx
 *     Index Cond: (user_id = $1) AND (id > $2)
 *   Filter: status = 'applied' AND origin_device_id IS DISTINCT FROM $3
 *   LIMIT N
 */
export async function syncV2Pull(req: Request, res: Response): Promise<void> {
  const start = process.hrtime.bigint();
  const user = (req as WithSessionUser).user!;

  const parsed = validateQuery(SyncV2PullSchema, req, res);
  if (!parsed.ok) {
    recordSyncV2("v2_pull", "invalid", {
      ms: elapsedMs(start),
      userId: user.id,
    });
    return;
  }
  const { since, limit } = parsed.data;
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

    // Hard rule #1: BIGSERIAL `id` повертається як string. Coerce у
    // number — JSON-споживачі очікують number, JS-число тримає 2^53,
    // що еквівалентно ~3000 років при 100k op/sec.
    const opsOut = result.rows.map((r) => ({
      id: Number(r.id),
      table: r.table_name,
      op: r.op,
      row: r.row,
      client_ts: r.client_ts.toISOString(),
      server_ts: r.server_ts.toISOString(),
      // eslint-disable-next-line sergeant-design/no-bigint-string -- TEXT column (UUID/ULID), not bigint; rule heuristic flags `_id` suffix indiscriminately.
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

    // PR #048 — pull RED-метрики (queue depth + staleness).
    //
    // `queue_depth` = скільки ops повернули цим pull-ом. Sustained
    // p95 = limit означає, що клієнт постійно "позаду" і має робити
    // наступний pull зразу — backpressure-сигнал для алертів.
    //
    // `pull_lag` = вік newest-op-у в батчі (now - server_ts). Це проксі
    // user-perceived staleness: SSE-стрім (PR #041) має тримати <100ms,
    // polling fallback — кілька секунд. Спостерігаємо тільки коли є хоч
    // один op у відповіді — пустий pull = клієнт уже на курсорі, lag
    // не визначений.
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

/**
 * Експортуємо whitelist для тестів і потенційних admin-ендпоінтів —
 * щоб не тримати copy-paste списку tables у `routes/sync.ts` чи
 * у тестовому коді.
 */
export const SYNC_V2_SUPPORTED_TABLES = Object.freeze(
  Object.keys(OP_LOG_TABLE_REGISTRY),
);
