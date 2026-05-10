/**
 * Константи Фізрука — ключі localStorage, версії схем, набори ключів для
 * резервних копій/скидань. Самі значення pure (рядки/числа/масиви); сюди
 * НЕ імпортуємо жодних DOM-залежностей, щоб пакет лишався придатним для
 * `apps/mobile` (React Native).
 */

export const WORKOUTS_STORAGE_KEY = "fizruk_workouts_v1";
export const CUSTOM_EXERCISES_KEY = "fizruk_custom_exercises_v1";
export const MEASUREMENTS_STORAGE_KEY = "fizruk_measurements_v1";
export const TEMPLATES_STORAGE_KEY = "fizruk_workout_templates_v1";
export const SELECTED_TEMPLATE_STORAGE_KEY = "fizruk_selected_template_id_v1";
export const ACTIVE_WORKOUT_KEY = "fizruk_active_workout_id_v1";
export const ACTIVE_PROGRAM_KEY = "fizruk_active_program_id_v1";
export const PLAN_TEMPLATE_STORAGE_KEY = "fizruk_plan_template_v1";
/** @deprecated Stage 12 PR #057f-tombstone-mobile-stage12 — use SQLite `fizruk_monthly_plan`. */
export const MONTHLY_PLAN_STORAGE_KEY = "fizruk_monthly_plan_v1";

export const WORKOUTS_SCHEMA_VERSION = 1;
export const CUSTOM_SCHEMA_VERSION = 1;

/** Ключі для експорту «всі дані Фізрука» (Progress). */
export const FIZRUK_FULL_BACKUP_KEYS = [
  WORKOUTS_STORAGE_KEY,
  MEASUREMENTS_STORAGE_KEY,
  CUSTOM_EXERCISES_KEY,
  TEMPLATES_STORAGE_KEY,
  SELECTED_TEMPLATE_STORAGE_KEY,
  MONTHLY_PLAN_STORAGE_KEY,
];

/** Скидання разом із службовими ключами сесії тренування. */
export const FIZRUK_RESET_KEYS = [
  ...FIZRUK_FULL_BACKUP_KEYS,
  ACTIVE_WORKOUT_KEY,
  PLAN_TEMPLATE_STORAGE_KEY,
];
