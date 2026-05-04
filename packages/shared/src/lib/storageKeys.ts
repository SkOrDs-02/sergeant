/**
 * Centralized localStorage key constants.
 * Prevents magic strings scattered across the codebase.
 *
 * When adding a new key, also consider whether it should be part of cloud
 * sync — if yes, add it to `SYNC_MODULES` in `src/core/cloudSync/useCloudSync.js`.
 */
export const STORAGE_KEYS = {
  // ─── Hub ──────────────────────────────────────────────────────────────
  DARK_MODE: "hub_dark_mode_v1",
  LAST_MODULE: "hub_last_module",
  ROUTINE: "hub_routine_v1",
  ROUTINE_MAIN_TAB: "hub_routine_main_tab_v1",
  NUTRITION_MAIN_TAB: "hub_nutrition_main_tab_v1",
  ONBOARDING_DONE: "hub_onboarding_done_v1",
  DASHBOARD_ORDER: "hub_dashboard_order_v1",
  HUB_PREFS: "hub_prefs_v1",
  USER_PROFILE: "hub_user_profile_v1",
  DASHBOARD_DENSITY: "hub_dashboard_density_v1",

  // Hub quick-stats previews rendered on the dashboard
  FINYK_QUICK_STATS: "finyk_quick_stats",
  FIZRUK_QUICK_STATS: "fizruk_quick_stats",
  ROUTINE_QUICK_STATS: "routine_quick_stats",
  NUTRITION_QUICK_STATS: "nutrition_quick_stats",

  // PWA / install prompts
  PWA_SESSION_COUNT: "pwa_session_count",
  PWA_INSTALL_DISMISSED: "pwa_install_dismissed",
  PWA_PENDING_ACTION: "pwa_pending_action",
  IOS_BANNER_DISMISSED: "ios_install_banner_dismissed",

  // Cloud sync metadata
  SYNC_VERSIONS: "hub_sync_versions",
  SYNC_DIRTY_MODULES: "hub_sync_dirty_modules",
  SYNC_MODULE_MODIFIED: "hub_sync_module_modified",
  SYNC_OFFLINE_QUEUE: "hub_sync_offline_queue",
  SYNC_MIGRATION_DONE: "hub_sync_migrated_users",

  // ─── Finyk ────────────────────────────────────────────────────────────
  FINYK_TX_CACHE: "finyk_tx_cache",
  FINYK_TX_CACHE_LAST_GOOD: "finyk_tx_cache_last_good",
  FINYK_INFO_CACHE: "finyk_info_cache",
  FINYK_TOKEN: "finyk_token",
  FINYK_STORAGE: "finyk_storage_v2",
  FINYK_SHOW_BALANCE: "finyk_show_balance_v1",
  FINYK_HIDDEN: "finyk_hidden",
  FINYK_HIDDEN_TXS: "finyk_hidden_txs",
  FINYK_EXCLUDED_STAT_TXS: "finyk_excluded_stat_txs",
  FINYK_BUDGETS: "finyk_budgets",
  FINYK_SUBS: "finyk_subs",
  FINYK_ASSETS: "finyk_assets",
  FINYK_DEBTS: "finyk_debts",
  FINYK_RECV: "finyk_recv",
  FINYK_MONTHLY_PLAN: "finyk_monthly_plan",
  FINYK_TX_CATS: "finyk_tx_cats",
  FINYK_TX_SPLITS: "finyk_tx_splits",
  FINYK_MONO_DEBT_LINKED: "finyk_mono_debt_linked",
  FINYK_NETWORTH_HISTORY: "finyk_networth_history",
  FINYK_CUSTOM_CATS: "finyk_custom_cats_v1",
  FINYK_MANUAL_EXPENSES: "finyk_manual_expenses_v1",
  FINYK_TX_FILTERS: "finyk_tx_filters_v1",
  // Per-day collapse state for the Transactions screen. Map of
  // `YYYY-MM-DD` day keys → boolean (true = expanded, false = collapsed).
  // Missing entries fall back to the default "only today is expanded"
  // rule; explicit entries always win so user toggles persist across
  // sessions. UI-only — intentionally excluded from cloud sync.
  FINYK_TX_DAY_COLLAPSE: "finyk_tx_day_collapse_v1",

  // ─── Fizruk ───────────────────────────────────────────────────────────
  FIZRUK_WORKOUTS: "fizruk_workouts_v1",
  FIZRUK_EXERCISES: "fizruk_exercises_v1",
  FIZRUK_CUSTOM_EXERCISES: "fizruk_custom_exercises_v1",
  FIZRUK_TEMPLATES: "fizruk_workout_templates_v1",
  FIZRUK_PLAN: "fizruk-storage-monthly-plan",
  FIZRUK_MONTHLY_PLAN: "fizruk_monthly_plan_v1",
  FIZRUK_PLAN_TEMPLATE: "fizruk_plan_template_v1",
  FIZRUK_WELLBEING: "fizruk_wellbeing_v1",
  FIZRUK_MEASUREMENTS: "fizruk_measurements_v1",
  FIZRUK_SELECTED_TEMPLATE: "fizruk_selected_template_id_v1",
  FIZRUK_ACTIVE_WORKOUT: "fizruk_active_workout_id_v1",
  FIZRUK_ACTIVE_PROGRAM: "fizruk_active_program_id_v1",
  FIZRUK_DAILY_LOG: "fizruk_daily_log_v1",
  FIZRUK_REST_SETTINGS: "fizruk_rest_settings_v1",

  // ─── Nutrition ────────────────────────────────────────────────────────
  NUTRITION_LOG: "nutrition_log_v1",
  NUTRITION_PANTRIES: "nutrition_pantries_v1",
  NUTRITION_ACTIVE_PANTRY: "nutrition_active_pantry_v1",
  NUTRITION_PREFS: "nutrition_prefs_v1",
  /** Локальна книга збережених рецептів (mobile MMKV; web — IndexedDB). */
  NUTRITION_SAVED_RECIPES: "nutrition_recipe_book_v1",

  // ─── Weekly Digest ────────────────────────────────────────────────────
  WEEKLY_DIGEST_PREFIX: "hub_weekly_digest_",
  // Opt-in flag for the Monday auto-generate. Default is OFF so a fresh
  // Monday visit never triggers an unexpected AI call; the setting lives in
  // Hub → Settings → AI Звіт тижня.
  WEEKLY_DIGEST_MONDAY_AUTO: "hub_weekly_digest_monday_auto_v1",

  // ─── Mobile: cloud sync metadata ──────────────────────────────────────
  // Mobile-only sync-subsystem keys. Prefixed with `mobile:` to avoid
  // colliding with web keys in shared tests / fixtures, and to make it
  // obvious at a glance that these live in MMKV (not localStorage).
  // See `docs/mobile/react-native-migration.md` § 6.1.
  MOBILE_SYNC_VERSIONS: "mobile:sync_versions",
  MOBILE_SYNC_DIRTY_MODULES: "mobile:sync_dirty_modules",
  MOBILE_SYNC_MODULE_MODIFIED: "mobile:sync_module_modified",
  MOBILE_SYNC_OFFLINE_QUEUE: "mobile:sync_offline_queue",
  /**
   * PR #040 — mobile dead-letter store. Lives next to
   * `MOBILE_SYNC_OFFLINE_QUEUE` in MMKV; entries that have failed
   * `MAX_QUEUE_ATTEMPTS` consecutive replay batches move out of the
   * live queue into here. Same shape as the web IDB
   * `dead_letter_queue` row so cross-platform sync diagnostics stay
   * apples-to-apples.
   */
  MOBILE_SYNC_DEAD_LETTER_QUEUE: "mobile:sync_dead_letter_queue",
  MOBILE_SYNC_MIGRATION_DONE: "mobile:sync_migrated_users",
  MOBILE_QUERY_CACHE: "mobile:query_cache_v1",

  // ─── Web: React Query persisted cache ────────────────────────────────
  // IndexedDB-backed persister key for `apps/web` (see
  // `apps/web/src/shared/lib/api/queryClientPersister.ts`). Mirrors mobile's
  // `MOBILE_QUERY_CACHE` so the warm-start contract is symmetrical
  // across platforms. The `web:` prefix guarantees we never collide with
  // any pre-existing `localStorage` keys — IDB has its own keyspace, but
  // having the prefix in source keeps grep / audits unambiguous.
  WEB_QUERY_CACHE: "web:query_cache_v1",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
