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
 * Час (epoch ms, рядок) останнього закриття банера «підключити банк».
 * Банер ховається на `BANK_BANNER_SNOOZE_DAYS` днів від цієї позначки
 * і потім повертається, якщо банк так і не підключено. Пристрій-локальний.
 */
export const FINYK_BANK_BANNER_DISMISSED_AT_KEY =
  "finyk_bank_banner_dismissed_at_v1";

/**
 * Keys covered by the JSON backup. Anything that
 * `readFinykBackupFromStorage` writes must appear here so the mobile
 * backup/restore adapters stay in lock-step with the web ones.
 */
export const FINYK_BACKUP_STORAGE_KEYS = Object.freeze({
  budgets: "finyk_budgets",
  subscriptions: "finyk_subs",
  /**
   * Ручні операції — те, заради чого бекап і роблять.
   *
   * AI-DANGER: до 2026-09-22 цього ключа тут не було, і експорт віддавав
   * `hiddenTxIds`, `txCategories`, `txSplits` — тобто НАДБУДОВИ над
   * операціями без самих операцій. Файл власника від 2026-09-21: 2 417 Б
   * при дев'яти операціях на 39 308,60 ₴ у базі, і поруч на тому ж екрані
   * обіцянка «ручні витрати живуть лише на цьому пристрої… зроби експорт».
   * Тобто єдина порада на випадок зміни телефона мовчки не працювала.
   */
  manualExpenses: "finyk_manual_expenses_v1",
  manualAssets: "finyk_assets",
  manualDebts: "finyk_debts",
  receivables: "finyk_recv",
  hiddenAccounts: "finyk_hidden",
  hiddenTxIds: "finyk_hidden_txs",
  excludedStatTxIds: "finyk_excluded_stat_txs",
  monthlyPlan: "finyk_monthly_plan",
  txCategories: "finyk_tx_cats",
  txSplits: "finyk_tx_splits",
  /**
   * Нотатки до банківських операцій (`{ [txId]: string }`). Живуть лише в
   * localStorage пристрою (не в SQLite dual-write, не в синку), тож бекап —
   * єдиний спосіб їх перенести (аудит 2026-10-01, data-27).
   */
  txNotes: "finyk_tx_notes",
  monoDebtLinkedTxIds: "finyk_mono_debt_linked",
  networthHistory: "finyk_networth_history",
  customCategories: "finyk_custom_cats_v1",
  dismissedRecurring: "finyk_rec_dismissed",
} as const);

/**
 * Pair keys (`${outgoing.id}:${incoming.id}`, see `transferSuggestionPairKey`
 * in `domain/transferMatching.ts`) the user permanently rejected via the
 * "Не переказ" action on `TransferSuggestionCard`. Device-local — not part
 * of {@link FINYK_BACKUP_STORAGE_KEYS}, mirroring the "dismiss forever"
 * intent of `dismissedRecurring` without requiring the cross-device SQLite
 * prefs-slice plumbing that key gets (a permanent per-device opt-out does
 * not need to travel with the account).
 */
export const FINYK_TRANSFER_SUGGESTION_REJECTED_KEY =
  "finyk_transfer_suggestion_rejected_v1";

/**
 * Pair keys snoozed via the "Не зараз" action on `TransferSuggestionCard`,
 * stored as a `Record<pairKey, kyivDayKey>` — the Kyiv day (`YYYY-MM-DD`)
 * the snooze was set on. The suggestion stays hidden only while the
 * current Kyiv day still matches the stored key; see
 * `filterTransferSuggestions` in `domain/transferMatching.ts`. Device-local,
 * same rationale as {@link FINYK_TRANSFER_SUGGESTION_REJECTED_KEY}.
 */
export const FINYK_TRANSFER_SUGGESTION_SNOOZED_KEY =
  "finyk_transfer_suggestion_snoozed_v1";
