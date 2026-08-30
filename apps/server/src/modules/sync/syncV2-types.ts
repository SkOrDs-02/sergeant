// ============================================================================
// SyncV2 Types — Stage 1 рефакторингу syncV2.ts
// ============================================================================

export type SyncV2Outcome =
  | "ok"
  | "empty"
  | "partial"
  | "conflict"
  | "invalid"
  | "too_large"
  | "unauthorized"
  | "error";

// Reject reasons — 55 значень, докуменовані в metrics.md §4
export const APPLY_REJECT_REASONS = [
  // CRDT / per-row state invariants
  "lww_conflict",
  /**
   * ВИВЕДЕНО З ОБІГУ на шляху запису — жоден apply-хендлер більше цього не
   * повертає. Значення лишається в enum навмисно: у клієнтів у локальному
   * `sync_op_outbox` уже лежать рядки з `reject_reason='tombstoned'` від
   * старого сервера, і їх читає `syncOpOutboxLifecycle` / dev-панель.
   *
   * Прибрано разом із перевіркою `deleted_at !== null` — повне обґрунтування
   * в `guardUuidPkApply` (`applySync-helpers.ts`). Коротко: перевірка стояла
   * після LWW, тож ловила лише записи, НОВІШІ за видалення, — тобто ті, що
   * за LWW мають вигравати. Через неї undo після видалення мовчки не
   * доїжджав на сервер (`SERGEANT-WEB-T`).
   *
   * Не додавай сюди нових продюсерів.
   */
  "tombstoned",
  "not_found",
  "delete_not_supported",
  // Authorization
  "user_id_mismatch",
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
  "missing_date_key",
  "missing_note_key",
  // Хвиля 4 — `routine_habit_skips` (третій стан дня, канон routine.md §5).
  "missing_skip_key",
  "invalid_at",
  // Field validation — timestamps
  "invalid_completed_at",
  "invalid_deleted_at",
  "invalid_created_at",
  "invalid_started_at",
  "invalid_ended_at",
  "invalid_last_completed_at",
  "invalid_last_used_at",
  "invalid_entry_at",
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
  "invalid_energy",
  "invalid_energy_level",
  "invalid_sleep_quality",
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
  // Append-only invariant (W1-ROUTINE-APPEND, стадія 1)
  // `routine_completion_events` приймає ЛИШЕ `op='insert'`. `update` /
  // `delete` означають спробу переписати історію — відхиляємо явно, а не
  // ховаємо під `delete_not_supported`, щоб метрика показувала саме
  // порушення append-only-інваріанта.
  "append_only_violation",
  // Append-only ledger комори (W1-PANTRY-APPEND, стадія 1).
  // `nutrition_pantry_events.kind` — закритий enum ('consume' | 'replenish'
  // | 'adjust' | 'initial'); чужий kind означає клієнта з іншого контракту,
  // і ховати це під загальний `apply_failed` (який виглядає як збій БД)
  // не можна.
  "invalid_event_kind",
  // Подія-дельта мусить нести `delta_qty`, подія-чекпойнт — `abs_qty`.
  // Рядок без жодного з них не згортається в число, тож пускати його в
  // журнал = створювати позицію з невідомим залишком назавжди.
  "missing_delta_or_abs",
  // Append-only журнал цілей КБЖВ (W1-KBJU-APPEND, стадія 1).
  // `nutrition_goal_periods.origin` — закритий enum ('manual' | 'preset' |
  // 'tdee' | 'backfill'). Окремий reason, а не спільний з
  // `invalid_event_kind`: там валідується `kind` події комори, і злиття
  // двох різних колонок в один лейбл зробило б метрику нечитаною.
  "invalid_goal_origin",
  // Позначка травми (ADR-0083) без зони — рядок, який нічого не блокує.
  // Окремий reason, а не `missing_name`: `site` — це ключ у keyspace
  // `InjurySiteId`, і сплутати його з людською назвою в метриці означало б
  // не побачити, що клієнт шле позначки без зони взагалі.
  "missing_site",
  // `cleared_at` — саме та колонка, NULL у якій означає «травма активна».
  // Нерозбірна дата тут не може тихо стати `clientTs`: це зняло б позначку
  // й повернуло травмовану зону в поради. Краще відхилити операцію.
  "invalid_cleared_at",
  // Pre-beta input-boundaries audit (beta-input-boundaries.md, Фаза 3 —
  // сервер): user-supplied name/label/note/text fields in sync payloads had
  // NO length bound at all — a `curl` could push a multi-MB string into
  // `nutrition_meals.name`. One shared reason across every bounded text
  // field (see `isWithinTextBound()` in `syncV2-core.ts`), rather than a
  // per-field `invalid_name`/`invalid_label`/`invalid_notes` fan-out — the
  // metric doesn't need per-column granularity for "this string is too
  // long", only per-table (already carried by the `table` label).
  "text_too_long",
  // `tz_offset_min` (migration 109, ADR-0078 device-local day boundary) had
  // no range check at all — any integer sailed through. A present value
  // outside the real UTC-offset range [-840, 840] minutes is now rejected
  // rather than silently accepted or nulled (CodeRabbit PR #627,
  // `parseOptionalTzOffsetMin()` in `syncV2-core.ts`).
  "invalid_tz_offset_min",
] as const;

export type ApplyRejectReason = (typeof APPLY_REJECT_REASONS)[number];

export const ENGINE_REJECT_REASONS = [
  "clock_skew",
  "table_not_allowed",
  "apply_failed",
  "duplicate",
  "op_not_supported",
] as const;

export type EngineRejectReason = (typeof ENGINE_REJECT_REASONS)[number];
export type RejectReason = ApplyRejectReason | EngineRejectReason;

export type AppliedStatus =
  { status: "applied" } | { status: "rejected"; reason: ApplyRejectReason };

// Re-export
export type { SyncV2Op } from "../../http/schemas.js";
