/**
 * @scaffolded
 * @owner @Skords-01
 * @addedIn ADR-0062 (docs/adr/0062-syncv2-module-decomposition.md)
 * @nextStep Wire the syncV2 decomposition (ADR-0062 Phase 1): import these
 *   types/constants from `syncV2.ts` and delete its duplicate copies, then
 *   remove this marker. Tracked in docs/adr/0062-syncv2-module-decomposition.md.
 *
 * Scaffolded but not yet imported by any consumer. Do NOT delete as part of
 * dead-code cleanup — see Hard Rule #10 in AGENTS.md.
 *
 * Types and constants for v2 op-log sync (ADR-0062).
 * Extracted from syncV2.ts to reduce module size and improve tree-shaking.
 */

import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../http/schemas.js";

/**
 * Operation kind for v2 sync events.
 */
export type SyncV2OpKind = "v2_push" | "v2_pull";

/**
 * Outcome для v2 sync_event / `sync_audit_log`. Дзеркалить (й
 * розширює) `SyncOutcome` з v1: додано `partial` для batch-push,
 * де якісь ops applied, якісь rejected. Audit-стовпець `outcome` —
 * TEXT без CHECK, тому розширення безпечне; admin-фільтр в
 * `audit.ts` досі приймає лише v1-значення, але це read-side і не
 * впливає на запис.
 */
export type SyncV2Outcome =
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
  /**
   * `row.user_id` was absent on a client envelope. Tightened by
   * HIGH-#2 of the T3 audit
   * (https://app.devin.ai/sessions/8574143f172540b7be52c314facfc0c5):
   * previously the apply-fn would silently substitute the session
   * userId, which was the vector for the shared-device leak
   * (user A's queued ops applied as user B's data after a session
   * swap). New contract — every applied op MUST carry an explicit
   * `row.user_id` that matches the session.
   */
  "missing_user_id",
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

/**
 * Result type for apply functions.
 */
export type AppliedStatus =
  | { status: "applied" }
  | { status: "rejected"; reason: ApplyRejectReason };

/**
 * Signature for apply functions that handle sync operations.
 */
export type ApplyFn = (
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
) => Promise<AppliedStatus>;

/**
 * Row shape for sync_op_log INSERT operations.
 */
export interface SyncOpLogInsertRow {
  id: string;
  server_ts: Date;
}

/**
 * Row shape for sync_op_log duplicate detection.
 */
export interface SyncOpLogDuplicateRow {
  id: string;
  status: "applied" | "duplicate" | "rejected";
  reject_reason: string | null;
}

/**
 * Row shape for pull operations.
 */
export interface PullRow {
  id: string;
  table_name: string;
  op: "insert" | "update" | "delete";
  row: unknown;
  client_ts: Date;
  server_ts: Date;
  origin_device_id: string | null;
}

/**
 * Module label для метрик/логів — стабільний `v2`, незалежно від `table`.
 */
export const SYNC_V2_MODULE = "v2";

/**
 * Maximum tolerated forward clock skew. Клієнти, що надсилають
 * `client_ts > server_ts + 1h`, відхиляються — інакше їхній
 * "майбутній" timestamp перевертатиме LWW і ламатиме реплікацію
 * для нормальних пристроїв.
 */
export const CLOCK_SKEW_FORWARD_MS = 60 * 60 * 1000;

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
