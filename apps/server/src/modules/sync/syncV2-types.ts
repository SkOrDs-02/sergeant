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

// Reject reasons — 51 значень, докуменовані в metrics.md §4
export const APPLY_REJECT_REASONS = [
  // CRDT / per-row state invariants
  "lww_conflict",
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
  | { status: "applied" }
  | { status: "rejected"; reason: ApplyRejectReason };

// Re-export
export type { SyncV2Op } from "../../http/schemas.js";
