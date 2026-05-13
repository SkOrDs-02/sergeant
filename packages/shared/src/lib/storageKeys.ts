/**
 * Centralized localStorage key constants.
 * Prevents magic strings scattered across the codebase.
 *
 * When adding a new key:
 * 1. Prefer SQLite over a new LS/MMKV slot — додай колонку у відповідну
 *    Drizzle-схему `packages/db-schema/src/sqlite/<module>.ts`, додай op-log
 *    write helper (через `enqueueSyncOp` з
 *    `packages/db-schema/src/sqlite/syncOpOutboxEnqueue.ts`), і додай
 *    table whitelist у `OP_LOG_TABLE_REGISTRY` сервера
 *    (`apps/server/src/modules/sync/syncV2.ts`). Так ключ автоматично
 *    учасник cross-device sync v2 (`POST /api/v2/sync/push`).
 * 2. Якщо все-таки LS/MMKV (UI-only prefs, кеш Mono API, residual
 *    bootstrap-state) — додай ключ нижче. **Не додавай у `SYNC_MODULES`**:
 *    blob-sync engine (v1) знятий з production у PR #052b/c (див. ADR-0047
 *    і ADR-0011 amendment 2026-05-10). `SYNC_MODULES` registry тримає
 *    лише `profile` як test-fixture для ESLint parity-check; нові
 *    cross-device-keys ідуть через op-log v2, не через його реєстр.
 *
 * `@deprecated`-marker нижче на ключі = tombstone: писати у нього не
 * можна (residual-import drains у SQLite на boot), літерал залишений
 * лише для cross-module reads / fixtures.
 */
export const STORAGE_KEYS = {
  // ─── Hub ──────────────────────────────────────────────────────────────
  DARK_MODE: "hub_dark_mode_v1",
  LAST_MODULE: "hub_last_module",
  /** @deprecated Stage 8 PR #057r-tombstone — use SQLite `routine_*` tables via `loadRoutineState()`. */
  ROUTINE: "hub_routine_v1",
  ROUTINE_MAIN_TAB: "hub_routine_main_tab_v1",
  NUTRITION_MAIN_TAB: "hub_nutrition_main_tab_v1",
  ONBOARDING_DONE: "hub_onboarding_done_v1",
  DASHBOARD_ORDER: "hub_dashboard_order_v1",
  HUB_PREFS: "hub_prefs_v1",
  USER_PROFILE: "hub_user_profile_v1",
  /**
   * Hub-level biometric parameters for nutrition / fitness calculations
   * (height, birth-date, sex, activity-level, current-weight). Lives in
   * Profile so a user without the Fizruk module still has the inputs
   * needed for BMR / TDEE — see PR plan in `biometrics-storage-plan.md`.
   * Synced via `SYNC_MODULES.profile` (LWW), same path as memory bank.
   */
  HUB_BIOMETRICS: "hub_biometrics_v1",
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

  // Cloud sync metadata — 5 web keys dropped in Stage 13 PR #077.
  // Historically: SYNC_VERSIONS ("hub_sync_versions"),
  // SYNC_DIRTY_MODULES ("hub_sync_dirty_modules"),
  // SYNC_MODULE_MODIFIED ("hub_sync_module_modified"),
  // SYNC_OFFLINE_QUEUE ("hub_sync_offline_queue"),
  // SYNC_MIGRATION_DONE ("hub_sync_migrated_users").
  // All were dead since PR #052b (cloudSync v1 engine drop). See
  // docs/planning/storage-roadmap.md § Stage 13 PR #077.
  /**
   * Per-install stable device ID forwarded as `X-Origin-Device-Id` on
   * every sync v2 push / pull / stream request. Server uses it for
   * own-write echo suppression (`origin_device_id IS DISTINCT FROM`)
   * and for the future LWW tiebreaker. ULID-shape (≤64 chars).
   *
   * Versioned (`_v1`) so a future change in identity semantics (e.g.
   * "tie device-id to better-auth session") can ship a new slot
   * without colliding with the previous one. Reads/writes go through
   * the platform's `KVStore` adapter (`webKVStore` / `mobileKVStore`).
   */
  SYNC_ORIGIN_DEVICE_ID: "sync_origin_device_id_v1",

  // ─── Finyk ────────────────────────────────────────────────────────────
  // Mono API cache keys — NOT dual-write-covered, kept as-is.
  FINYK_TX_CACHE: "finyk_tx_cache",
  FINYK_TX_CACHE_LAST_GOOD: "finyk_tx_cache_last_good",
  FINYK_INFO_CACHE: "finyk_info_cache",
  FINYK_TOKEN: "finyk_token",
  // FINYK_STORAGE (`finyk_storage_v2`) entry was dropped in PR #072
  // (storage-roadmap Stage 13). The monolithic blob from the pre-Stage-4
  // era (PR #035–#039 split it into per-key slots + per-table SQLite
  // mirror) had no writers since 2026 and only a pair of lying
  // `monthlyBudget` readers in `useWeeklyDigest` / `weeklyDigestAggregates`.
  /**
   * @deprecated Stage 13 PR #074 — UI читає через `useFinykStorageSlots`
   * slot bundle (`storage.showBalance`), який overlay-ить
   * `finyk_prefs.show_balance` із SQLite кеша. LS лишається лише як
   * synchronous first-paint fallback (`useState` initializer у
   * `useFinykStorageSlots.ts`); dual-write pipeline writes до
   * `finyk_prefs.show_balance` — production callsite-ів `setItem` для
   * `finyk_show_balance_v1` більше нема.
   */
  FINYK_SHOW_BALANCE: "finyk_show_balance_v1",
  /** @deprecated Stage 8 PR #057k-tombstone — use SQLite `finyk_hidden_accounts`. */
  FINYK_HIDDEN: "finyk_hidden",
  /** @deprecated Stage 8 PR #057k-tombstone — use SQLite `finyk_hidden_transactions`. */
  FINYK_HIDDEN_TXS: "finyk_hidden_txs",
  /** @deprecated Stage 13 PR #075 — use SQLite `finyk_prefs.excluded_stat_tx_ids_json`. */
  FINYK_EXCLUDED_STAT_TXS: "finyk_excluded_stat_txs",
  /** @deprecated Stage 8 PR #057k-tombstone — use SQLite `finyk_budgets`. */
  FINYK_BUDGETS: "finyk_budgets",
  /** @deprecated Stage 8 PR #057k-tombstone — use SQLite `finyk_subscriptions`. */
  FINYK_SUBS: "finyk_subs",
  /** @deprecated Stage 8 PR #057k-tombstone — use SQLite `finyk_assets`. */
  FINYK_ASSETS: "finyk_assets",
  /** @deprecated Stage 8 PR #057k-tombstone — use SQLite `finyk_debts`. */
  FINYK_DEBTS: "finyk_debts",
  /** @deprecated Stage 8 PR #057k-tombstone — use SQLite `finyk_receivables`. */
  FINYK_RECV: "finyk_recv",
  /** @deprecated Stage 8 PR #057k-tombstone — use SQLite `finyk_prefs.monthly_plan_json`. */
  FINYK_MONTHLY_PLAN: "finyk_monthly_plan",
  /** @deprecated Stage 8 PR #057k-tombstone — use SQLite `finyk_tx_categories`. */
  FINYK_TX_CATS: "finyk_tx_cats",
  /** @deprecated Stage 8 PR #057k-tombstone — use SQLite `finyk_tx_splits`. */
  FINYK_TX_SPLITS: "finyk_tx_splits",
  /** @deprecated Stage 8 PR #057k-tombstone — use SQLite `finyk_mono_debt_links`. */
  FINYK_MONO_DEBT_LINKED: "finyk_mono_debt_linked",
  /** @deprecated Stage 8 PR #057k-tombstone — use SQLite `finyk_networth_history`. */
  FINYK_NETWORTH_HISTORY: "finyk_networth_history",
  /** @deprecated Stage 8 PR #057k-tombstone — use SQLite `finyk_custom_categories`. */
  FINYK_CUSTOM_CATS: "finyk_custom_cats_v1",
  /** @deprecated Stage 8 PR #057k-tombstone — use SQLite `finyk_manual_expenses`. */
  FINYK_MANUAL_EXPENSES: "finyk_manual_expenses_v1",
  FINYK_TX_FILTERS: "finyk_tx_filters_v1",
  // Per-day collapse state for the Transactions screen. Map of
  // `YYYY-MM-DD` day keys → boolean (true = expanded, false = collapsed).
  // Missing entries fall back to the default "only today is expanded"
  // rule; explicit entries always win so user toggles persist across
  // sessions. UI-only — intentionally excluded from cloud sync.
  FINYK_TX_DAY_COLLAPSE: "finyk_tx_day_collapse_v1",

  // ─── Fizruk ───────────────────────────────────────────────────────────
  /** @deprecated Stage 8 PR #057f-tombstone — use SQLite `fizruk_workouts`. */
  FIZRUK_WORKOUTS: "fizruk_workouts_v1",
  FIZRUK_EXERCISES: "fizruk_exercises_v1",
  /** @deprecated Stage 8 PR #057f-tombstone — use SQLite `fizruk_custom_exercises`. */
  FIZRUK_CUSTOM_EXERCISES: "fizruk_custom_exercises_v1",
  /** @deprecated Stage 12 PR #057f-tombstone-mobile-stage12 — use SQLite `fizruk_workout_templates`. */
  FIZRUK_TEMPLATES: "fizruk_workout_templates_v1",
  FIZRUK_PLAN: "fizruk-storage-monthly-plan",
  FIZRUK_MONTHLY_PLAN: "fizruk_monthly_plan_v1",
  /** @deprecated Stage 12.5 PR #057f2-tombstone-mobile-stage12-5 — use SQLite `fizruk_plan_templates`. */
  FIZRUK_PLAN_TEMPLATE: "fizruk_plan_template_v1",
  /** @deprecated Stage 12.5 PR #057f2-tombstone-mobile-stage12-5 — use SQLite `fizruk_wellbeing`. */
  FIZRUK_WELLBEING: "fizruk_wellbeing_v1",
  /** @deprecated Stage 8 PR #057f-tombstone — use SQLite `fizruk_measurements`. */
  FIZRUK_MEASUREMENTS: "fizruk_measurements_v1",
  FIZRUK_SELECTED_TEMPLATE: "fizruk_selected_template_id_v1",
  FIZRUK_ACTIVE_WORKOUT: "fizruk_active_workout_id_v1",
  /** @deprecated Stage 12.5 PR #057f2-tombstone-mobile-stage12-5 — use SQLite `fizruk_programs`. */
  FIZRUK_ACTIVE_PROGRAM: "fizruk_active_program_id_v1",
  /** @deprecated Stage 12 PR #057f-tombstone-mobile-stage12 — use SQLite `fizruk_daily_log`. */
  FIZRUK_DAILY_LOG: "fizruk_daily_log_v1",
  FIZRUK_REST_SETTINGS: "fizruk_rest_settings_v1",

  // ─── Nutrition ────────────────────────────────────────────────────────
  // Stage 8 PR #057n-tombstone: the keys below are tombstoned. The
  // SQLite-WASM (web) / expo-sqlite (mobile) `nutrition_*` tables are
  // the canonical source of truth. The boot-time residual-import helper
  // (`apps/{web,mobile}/src/modules/nutrition/lib/residualImport.ts`)
  // imports any leftover values written by older builds into SQLite
  // and then deletes the LS / MMKV entries. Entries are kept here (not
  // deleted) so legacy cross-module reads / fixtures still resolve to
  // the same string literals. **Do NOT add new reads/writes against
  // these keys.**
  /** @deprecated Stage 8 PR #057n-tombstone — use SQLite `nutrition_meals`. */
  NUTRITION_LOG: "nutrition_log_v1",
  /** @deprecated Stage 8 PR #057n-tombstone — use SQLite `nutrition_pantries` / `nutrition_pantry_items`. */
  NUTRITION_PANTRIES: "nutrition_pantries_v1",
  /** @deprecated Stage 8 PR #057n-tombstone — use SQLite `nutrition_prefs.active_pantry_id`. */
  NUTRITION_ACTIVE_PANTRY: "nutrition_active_pantry_v1",
  /** @deprecated Stage 8 PR #057n-tombstone — use SQLite `nutrition_prefs`. */
  NUTRITION_PREFS: "nutrition_prefs_v1",
  /**
   * Локальна книга збережених рецептів (mobile MMKV; web — IndexedDB).
   * Mobile MMKV-write path tombstoned by Stage 13 PR #073; reads now
   * come from the SQLite warm cache. Web copy lives in the
   * `nutrition_recipes` IndexedDB store inside `sergeant-db` and uses
   * its own dual-write/residual-import path.
   * @deprecated Stage 13 PR #073 — use SQLite `nutrition_recipes`.
   */
  NUTRITION_SAVED_RECIPES: "nutrition_recipe_book_v1",

  // ─── Weekly Digest ────────────────────────────────────────────────────
  WEEKLY_DIGEST_PREFIX: "hub_weekly_digest_",
  // Opt-in flag for the Monday auto-generate. Default is OFF so a fresh
  // Monday visit never triggers an unexpected AI call; the setting lives in
  // Hub → Settings → AI Звіт тижня.
  WEEKLY_DIGEST_MONDAY_AUTO: "hub_weekly_digest_monday_auto_v1",

  // ─── Mobile: cloud sync metadata ──────────────────────────────────────
  // 6 mobile sync-metadata keys dropped in Stage 13 PR #077.
  // Historically: MOBILE_SYNC_VERSIONS ("mobile:sync_versions"),
  // MOBILE_SYNC_DIRTY_MODULES ("mobile:sync_dirty_modules"),
  // MOBILE_SYNC_MODULE_MODIFIED ("mobile:sync_module_modified"),
  // MOBILE_SYNC_OFFLINE_QUEUE ("mobile:sync_offline_queue"),
  // MOBILE_SYNC_DEAD_LETTER_QUEUE ("mobile:sync_dead_letter_queue"),
  // MOBILE_SYNC_MIGRATION_DONE ("mobile:sync_migrated_users").
  // All were dead since PR #052b (cloudSync v1 engine drop).
  // See docs/planning/storage-roadmap.md § Stage 13 PR #077.
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
