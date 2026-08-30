// All localStorage keys the demo seeder writes / clears. Kept inline
// (no cross-module barrel import) so a rename in any module silently
// disables the seeder for that module instead of crashing on boot.

export const DEMO_FLAG_KEY = "hub_demo_seeded_social_v1";
export const DEMO_CLEANUP_DONE_KEY = "hub_demo_cleanup_v1_done";
export const ONBOARDING_DONE_KEY = "hub_onboarding_done_v1";
export const FIRST_REAL_ENTRY_KEY = "hub_first_real_entry_v1";
export const FINYK_MANUAL_ONLY_KEY = "finyk_manual_only_v1";

export const FINYK_MANUAL_EXPENSES_KEY = "finyk_manual_expenses_v1";
export const FINYK_CUSTOM_CATS_KEY = "finyk_custom_cats_v1";
export const FINYK_MONTHLY_PLAN_KEY = "finyk_monthly_plan";
export const FINYK_TX_CACHE_KEY = "finyk_tx_cache";
export const FINYK_TX_CACHE_LAST_GOOD_KEY = "finyk_tx_cache_last_good";
export const FIZRUK_WORKOUTS_KEY = "fizruk_workouts_v1";
export const FIZRUK_MEASUREMENTS_KEY = "fizruk_measurements_v1"; // gitleaks:allow
/**
 * Шаблони тренувань. Демо їх не сіяло взагалі, тож кнопка «Із шаблону»
 * на хоумі «Тренувань» вела в порожній список — на вітрині це читалось
 * як «фічі нема» (аудит L-10, 2026-08-07). Значення мусить збігатися з
 * `STORAGE_KEYS.FIZRUK_TEMPLATES`.
 */
export const FIZRUK_TEMPLATES_KEY = "fizruk_workout_templates_v1";
/**
 * Демо-лічильник віджимань (перенос власності routine → fizruk,
 * 2026-08-30). НЕ `fizruk_pushups_v1`: той ключ — легасі-джерело
 * migrateLegacyPushups у `storageManager.ts`, і запис у нього воскресив би
 * односторонню міграцію в routine-стан.
 */
export const FIZRUK_PUSHUPS_SEED_KEY = "fizruk_pushups_seed_v1";
export const ROUTINE_STATE_KEY = "hub_routine_v1";
export const NUTRITION_LOG_KEY = "nutrition_log_v1";
export const NUTRITION_PREFS_KEY = "nutrition_prefs_v1"; // gitleaks:allow
export const NUTRITION_WATER_KEY = "nutrition_water_v1";

// Hub-dashboard quick-stats previews rendered on the Status row of
// each module card. Separate from the module's own storage — the hub
// reads these directly so each module typically writes them as a
// side-effect of its own state updates. The seeder needs to populate
// them itself so `?demo=1` immediately shows non-empty module rows.
export const FINYK_QUICK_STATS_KEY = "finyk_quick_stats";
export const FIZRUK_QUICK_STATS_KEY = "fizruk_quick_stats";
export const ROUTINE_QUICK_STATS_KEY = "routine_quick_stats";
export const NUTRITION_QUICK_STATS_KEY = "nutrition_quick_stats";

// Per-module FTUX checklist state (`<moduleId>_checklist_v1`). The demo
// seeds these as fully completed so a ~14-day-active demo user doesn't
// see new-user "Перші кроки" checklists. Key format mirrors
// `storageKey()` in `@sergeant/shared` moduleChecklist.
export const FINYK_CHECKLIST_KEY = "finyk_checklist_v1";
export const FIZRUK_CHECKLIST_KEY = "fizruk_checklist_v1";
export const ROUTINE_CHECKLIST_KEY = "routine_checklist_v1";
export const NUTRITION_CHECKLIST_KEY = "nutrition_checklist_v1";
