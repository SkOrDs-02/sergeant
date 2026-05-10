/**
 * SQLite-backed read path for Finyk (hidden accounts/transactions,
 * budgets / subscriptions / assets / debts / receivables / custom
 * categories / manual expenses, per-tx category / splits / mono-debt
 * mappings, networth history, prefs).
 *
 * Stage 4 PR #037 of `docs/planning/storage-roadmap.md`. When the
 * `feature.finyk.sqlite_v2.read_sqlite` flag is on, the public storage
 * hook (`useStorage` via `useFinykStorageSlots`) overlays its slot
 * values from this cache instead of the LS bundle. LS writes still
 * happen — they remain as a safety net during the cutover (PR #037
 * cuts over reads only; PR #039 drops the LS path).
 *
 * Mirror of `apps/web/src/modules/nutrition/lib/sqliteReader.ts` and
 * `apps/web/src/modules/fizruk/lib/sqliteReader.ts` — same cache
 * pattern + refresh-helper shape. The cache is a plain JS object so
 * the merge into the React state is a single object-spread on every
 * read.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type {
  Budget,
  CustomCategory,
  ManualAsset,
  ManualExpense,
  MonoDebtLinkedMap,
  MonthlyPlan,
  NetworthEntry,
  Subscription,
  TxCategoriesMap,
  TxSplitsMap,
} from "../hooks/useStorage.types";
import type { Debt, Receivable, TxSplit } from "@sergeant/finyk-domain/domain";

export interface SqliteFinykCache {
  /** Account ids hidden from balances (set membership). */
  hiddenAccounts: string[];
  /** Transaction ids hidden from feeds (set membership). */
  hiddenTransactions: string[];
  /** User budgets (parsed from `data_json`). */
  budgets: Budget[];
  /** Subscriptions (parsed from `data_json`). */
  subscriptions: Subscription[];
  /** Manual assets (parsed from `data_json`). */
  manualAssets: ManualAsset[];
  /** Manual debts (parsed from `data_json`). */
  manualDebts: Debt[];
  /** Receivables (parsed from `data_json`). */
  receivables: Receivable[];
  /** Custom categories (parsed from `data_json`). */
  customCategories: CustomCategory[];
  /** Manual expenses (parsed from `data_json`). */
  manualExpenses: ManualExpense[];
  /** Per-tx category overrides keyed by transactionId. */
  txCategories: TxCategoriesMap;
  /** Per-tx splits keyed by transactionId. */
  txSplits: TxSplitsMap;
  /** Per-tx mono-debt links keyed by transactionId. */
  monoDebtLinkedTxIds: MonoDebtLinkedMap;
  /** Time-series networth history (oldest → newest). */
  networthHistory: NetworthEntry[];
  /** Singleton monthly plan (parsed from `monthly_plan_json`). */
  monthlyPlan: MonthlyPlan | null;
  /** Singleton balance-visibility flag from prefs. */
  showBalance: boolean | null;
  /**
   * Singleton list of Mono transaction ids excluded from statistics
   * (parsed from `excluded_stat_tx_ids_json`). `null` until the first
   * refresh completes — mirrors `monthlyPlan`/`showBalance` semantics.
   */
  excludedStatTxIds: string[] | null;
  /**
   * Singleton list of recurring-banner ids the user dismissed
   * (parsed from `dismissed_recurring_json`).
   */
  dismissedRecurring: string[] | null;
  /** ISO timestamp of the last successful refresh, or null. */
  refreshedAt: string | null;
}

const EMPTY_CACHE: SqliteFinykCache = {
  hiddenAccounts: [],
  hiddenTransactions: [],
  budgets: [],
  subscriptions: [],
  manualAssets: [],
  manualDebts: [],
  receivables: [],
  customCategories: [],
  manualExpenses: [],
  txCategories: {},
  txSplits: {},
  monoDebtLinkedTxIds: {},
  networthHistory: [],
  monthlyPlan: null,
  showBalance: null,
  excludedStatTxIds: null,
  dismissedRecurring: null,
  refreshedAt: null,
};

let cache: SqliteFinykCache = { ...EMPTY_CACHE };

/** Returns the current cached finyk state (sync, zero-cost). */
export function getCachedFinykSqliteState(): SqliteFinykCache {
  return cache;
}

// -----------------------------------------------------------------------
// Row interfaces — mirror the SQLite column shapes from the adapter.
// -----------------------------------------------------------------------

interface IdRow {
  id: string;
  [key: string]: unknown;
}

interface AccountIdRow {
  account_id: string;
  [key: string]: unknown;
}

interface TransactionIdRow {
  transaction_id: string;
  [key: string]: unknown;
}

interface BlobRow {
  id: string;
  data_json: string | null;
  [key: string]: unknown;
}

interface TxCategoryRow {
  transaction_id: string;
  category_id: string;
  [key: string]: unknown;
}

interface TxSplitsRow {
  transaction_id: string;
  splits_json: string | null;
  [key: string]: unknown;
}

interface MonoDebtLinkRow {
  transaction_id: string;
  debt_ids_json: string | null;
  [key: string]: unknown;
}

interface NetworthRow {
  month: string;
  networth: number | null;
  [key: string]: unknown;
}

interface PrefsRow {
  user_id: string;
  prefs_json: string | null;
  monthly_plan_json: string | null;
  show_balance: number | null;
  excluded_stat_tx_ids_json: string | null;
  dismissed_recurring_json: string | null;
  [key: string]: unknown;
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Parse a `data_json` blob row into the typed domain shape. Returns
 * `null` when the blob can't be parsed, so the caller filters them
 * out and the hook never sees half-formed entries. Each per-row
 * blob always carries its `id` from the row, even if the blob's
 * inner shape happens not to.
 */
function rowToBlob<T extends { id: string }>(row: BlobRow): T | null {
  if (!row.data_json) return null;
  const parsed = safeParseJson<Record<string, unknown> | null>(
    row.data_json,
    null,
  );
  if (!parsed || typeof parsed !== "object") return null;
  // The dual-write layer serialises every blob from a typed entry, so
  // `data_json` is always either the original `T` shape or a forward-
  // compatible superset. The `as T` is therefore the same boundary cast
  // every blob-table reader makes (cf. nutrition / fizruk), narrowed
  // here from `Record<string, unknown>` after `id` is forced from the
  // row column to keep referential integrity even if the JSON drifted.
  return { ...parsed, id: row.id } as T;
}

// -----------------------------------------------------------------------
// Refresh
// -----------------------------------------------------------------------

/**
 * Refresh the finyk cache from the local SQLite tables. Reads all
 * active (non-tombstoned) rows for `userId` and assembles them into
 * the slot shapes consumed by `useFinykStorageSlots`.
 */
export async function refreshFinykSqliteState(
  client: SqliteMigrationClient,
  userId: string,
): Promise<SqliteFinykCache> {
  const [
    hiddenAccountRows,
    hiddenTransactionRows,
    budgetRows,
    subscriptionRows,
    assetRows,
    debtRows,
    receivableRows,
    customCategoryRows,
    manualExpenseRows,
    txCategoryRows,
    txSplitsRows,
    monoDebtLinkRows,
    networthRows,
    prefsRows,
  ] = await Promise.all([
    client.all<AccountIdRow>(
      `SELECT account_id
         FROM finyk_hidden_accounts
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY account_id ASC`,
      [userId],
    ),
    client.all<TransactionIdRow>(
      `SELECT transaction_id
         FROM finyk_hidden_transactions
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY transaction_id ASC`,
      [userId],
    ),
    client.all<BlobRow>(
      `SELECT id, data_json
         FROM finyk_budgets
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [userId],
    ),
    client.all<BlobRow>(
      `SELECT id, data_json
         FROM finyk_subscriptions
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [userId],
    ),
    client.all<BlobRow>(
      `SELECT id, data_json
         FROM finyk_assets
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [userId],
    ),
    client.all<BlobRow>(
      `SELECT id, data_json
         FROM finyk_debts
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [userId],
    ),
    client.all<BlobRow>(
      `SELECT id, data_json
         FROM finyk_receivables
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [userId],
    ),
    client.all<BlobRow>(
      `SELECT id, data_json
         FROM finyk_custom_categories
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [userId],
    ),
    client.all<BlobRow>(
      `SELECT id, data_json
         FROM finyk_manual_expenses
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [userId],
    ),
    client.all<TxCategoryRow>(
      `SELECT transaction_id, category_id
         FROM finyk_tx_categories
        WHERE user_id = ?`,
      [userId],
    ),
    client.all<TxSplitsRow>(
      `SELECT transaction_id, splits_json
         FROM finyk_tx_splits
        WHERE user_id = ?`,
      [userId],
    ),
    client.all<MonoDebtLinkRow>(
      `SELECT transaction_id, debt_ids_json
         FROM finyk_mono_debt_links
        WHERE user_id = ?`,
      [userId],
    ),
    client.all<NetworthRow>(
      `SELECT month, networth
         FROM finyk_networth_history
        WHERE user_id = ?
        ORDER BY month ASC`,
      [userId],
    ),
    client.all<PrefsRow>(
      `SELECT user_id, prefs_json, monthly_plan_json, show_balance,
              excluded_stat_tx_ids_json, dismissed_recurring_json
         FROM finyk_prefs
        WHERE user_id = ?`,
      [userId],
    ),
  ]);

  const budgets = budgetRows
    .map((r) => rowToBlob<Budget>(r))
    .filter((x): x is Budget => x !== null);
  const subscriptions = subscriptionRows
    .map((r) => rowToBlob<Subscription>(r))
    .filter((x): x is Subscription => x !== null);
  const manualAssets = assetRows
    .map((r) => rowToBlob<ManualAsset>(r))
    .filter((x): x is ManualAsset => x !== null);
  const manualDebts = debtRows
    .map((r) => rowToBlob<Debt>(r))
    .filter((x): x is Debt => x !== null);
  const receivables = receivableRows
    .map((r) => rowToBlob<Receivable>(r))
    .filter((x): x is Receivable => x !== null);
  const customCategories = customCategoryRows
    .map((r) => rowToBlob<CustomCategory>(r))
    .filter((x): x is CustomCategory => x !== null);
  const manualExpenses = manualExpenseRows
    .map((r) => rowToBlob<ManualExpense>(r))
    .filter((x): x is ManualExpense => x !== null);

  const txCategories: TxCategoriesMap = {};
  for (const row of txCategoryRows) {
    txCategories[row.transaction_id] = row.category_id;
  }

  const txSplits: TxSplitsMap = {};
  for (const row of txSplitsRows) {
    const splits = safeParseJson<TxSplit[]>(row.splits_json, []);
    if (Array.isArray(splits)) {
      txSplits[row.transaction_id] = splits;
    }
  }

  const monoDebtLinkedTxIds: MonoDebtLinkedMap = {};
  for (const row of monoDebtLinkRows) {
    const debtIds = safeParseJson<string[]>(row.debt_ids_json, []);
    if (Array.isArray(debtIds)) {
      monoDebtLinkedTxIds[row.transaction_id] = debtIds;
    }
  }

  const networthHistory: NetworthEntry[] = networthRows.map((row) => ({
    month: row.month,
    networth: row.networth ?? 0,
  }));

  const prefsRow = prefsRows[0] ?? null;
  const monthlyPlan = prefsRow
    ? safeParseJson<MonthlyPlan | null>(prefsRow.monthly_plan_json, null)
    : null;
  const showBalance = prefsRow
    ? prefsRow.show_balance === null
      ? null
      : prefsRow.show_balance === 1
    : null;
  const excludedStatTxIds = prefsRow
    ? safeStringArray(prefsRow.excluded_stat_tx_ids_json)
    : null;
  const dismissedRecurring = prefsRow
    ? safeStringArray(prefsRow.dismissed_recurring_json)
    : null;

  cache = {
    hiddenAccounts: hiddenAccountRows.map((r) => r.account_id),
    hiddenTransactions: hiddenTransactionRows.map((r) => r.transaction_id),
    budgets,
    subscriptions,
    manualAssets,
    manualDebts,
    receivables,
    customCategories,
    manualExpenses,
    txCategories,
    txSplits,
    monoDebtLinkedTxIds,
    networthHistory,
    monthlyPlan,
    showBalance,
    excludedStatTxIds,
    dismissedRecurring,
    refreshedAt: new Date().toISOString(),
  };
  return cache;
}

function safeStringArray(raw: string | null | undefined): string[] {
  const parsed = safeParseJson<unknown>(raw ?? null, []);
  if (!Array.isArray(parsed)) return [];
  const out: string[] = [];
  for (const item of parsed) {
    if (typeof item === "string" && item.length > 0) out.push(item);
  }
  return out;
}

/** Reset cache — used by tests and when the flag is toggled off. */
export function clearFinykSqliteCache(): void {
  cache = { ...EMPTY_CACHE };
}

// Suppress unused-warning for the IdRow alias kept above for future
// per-row reads (e.g. raw `id` lookups).
export type { IdRow };
