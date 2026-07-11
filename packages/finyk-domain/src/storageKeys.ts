/**
 * Finyk — persistent storage keys.
 *
 * All localStorage / MMKV / AsyncStorage keys used by the Finyk module,
 * centralised as a pure module so both `apps/web` (localStorage) and
 * `apps/mobile` (MMKV via `src/lib/storage.ts`) can consume the same
 * set of identifiers without duplicating string literals.
 *
 * IMPORTANT: renaming any constant here requires a migration path —
 * these strings are persisted on existing user devices. Prefer adding
 * new keys over renaming.
 */

/**
 * Canonical domain-entity keys managed by `finykStorage.ts` on web
 * and its mobile twin. These are the only keys exposed through the
 * typed `getTransactions` / `getCategories` / `getBudget` API.
 */
export const FINYK_STORAGE_KEYS = Object.freeze({
  transactions: "finyk_manual_expenses_v1",
  categories: "finyk_custom_cats_v1",
  budget: "finyk_budgets",
} as const);

export type FinykStorageKey =
  (typeof FINYK_STORAGE_KEYS)[keyof typeof FINYK_STORAGE_KEYS];

/**
 * Flag that lets Finyk render its full UI even without a Monobank
 * token. Set by the onboarding "Додати першу витрату" path and by the
 * "Далі без банку" escape hatch on the Finyk login screen itself.
 *
 * Value semantics: presence of the string `"1"` = enabled, anything
 * else (including missing key) = disabled.
 */
export const FINYK_MANUAL_ONLY_KEY = "finyk_manual_only_v1";

/**
 * Keys covered by the JSON backup + `?sync=` payload. Anything that
 * `readFinykBackupFromStorage` writes must appear here so the mobile
 * backup/restore adapters stay in lock-step with the web ones.
 */
export const FINYK_BACKUP_STORAGE_KEYS = Object.freeze({
  budgets: "finyk_budgets",
  subscriptions: "finyk_subs",
  manualAssets: "finyk_assets",
  manualDebts: "finyk_debts",
  receivables: "finyk_recv",
  hiddenAccounts: "finyk_hidden",
  hiddenTxIds: "finyk_hidden_txs",
  monthlyPlan: "finyk_monthly_plan",
  txCategories: "finyk_tx_cats",
  txSplits: "finyk_tx_splits",
  monoDebtLinkedTxIds: "finyk_mono_debt_linked",
  networthHistory: "finyk_networth_history",
  customCategories: "finyk_custom_cats_v1",
  dismissedRecurring: "finyk_rec_dismissed",
} as const);
