/**
 * SQLite-backed read path for Finyk (mobile).
 *
 * Mirror of `apps/web/src/modules/finyk/lib/sqliteReader.ts` — see the
 * web copy for the full design rationale (PR #037 of
 * `docs/planning/storage-roadmap.md`). Mobile keeps the cache shape
 * and refresh helper at parity so the hook overlay works identically.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type {
  Budget,
  Debt,
  ManualAsset,
  MonthlyPlan,
  Receivable,
  TxSplit,
  TxSplitsMap,
  TxCategoriesMap,
} from "@sergeant/finyk-domain/domain";

import type { Subscription } from "./budgetsStore";

// Local-only types — kept inside the reader so we don't introduce a
// circular import with `transactionsStore.ts` (which also depends on
// the reader). The runtime payloads are produced by the dual-write
// extractors so the structural shape matches what every consumer
// store already declares for its own slot.

/** Mirrors `ManualExpenseRecord` in `transactionsStore.ts`. */
interface ManualExpense {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
}

/** Mirrors the web `CustomCategory` shape (id + label). */
interface CustomCategory {
  id: string;
  label: string;
  emoji?: string;
}

interface NetworthEntry {
  month: string;
  networth: number;
}

type MonoDebtLinkedMap = Record<string, string[] | undefined>;

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
  refreshedAt: null,
};

let cache: SqliteFinykCache = { ...EMPTY_CACHE };

/** Returns the current cached finyk state (sync, zero-cost). */
export function getCachedFinykSqliteState(): SqliteFinykCache {
  return cache;
}

// -----------------------------------------------------------------------
// Row interfaces
// -----------------------------------------------------------------------

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

function rowToBlob<T extends { id: string }>(row: BlobRow): T | null {
  if (!row.data_json) return null;
  const parsed = safeParseJson<Record<string, unknown> | null>(
    row.data_json,
    null,
  );
  if (!parsed || typeof parsed !== "object") return null;
  // The dual-write layer serialises every blob from a typed entry, so
  // `data_json` is always either the original `T` shape or a forward-
  // compatible superset. The `as T` is the same boundary cast every
  // blob-table reader makes (cf. nutrition / fizruk).
  return { ...parsed, id: row.id } as T;
}

// -----------------------------------------------------------------------
// Refresh
// -----------------------------------------------------------------------

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
      `SELECT user_id, prefs_json, monthly_plan_json, show_balance
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
    refreshedAt: new Date().toISOString(),
  };
  return cache;
}

/** Reset cache — used by tests. */
export function clearFinykSqliteCache(): void {
  cache = { ...EMPTY_CACHE };
}
