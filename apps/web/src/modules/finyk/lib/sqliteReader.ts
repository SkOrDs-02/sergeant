/**
 * SQLite-backed read path for Finyk (hidden accounts/transactions,
 * budgets / subscriptions / assets / debts / receivables / custom
 * categories / manual expenses, per-tx category / splits / mono-debt
 * mappings, networth history, prefs).
 *
 * Stage 4 PR #037 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`. When the
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
import {
  sanitizeMerchantRules,
  type MerchantRule,
} from "@sergeant/finyk-domain/lib/merchantRules";
import {
  EMPTY_FINYK_SQLITE_CACHE,
  getCachedFinykSqliteState,
  setFinykSqliteCache,
  type SqliteFinykCache,
} from "./sqliteCacheState";

// Стан кешу живе в легкому `sqliteCacheState.ts` (eager-споживачі
// імпортують звідти); тут — реекспорт для наявних імпортерів рідера.
export { getCachedFinykSqliteState, type SqliteFinykCache };

// DCRUD-007b: `cache` is published last-writer-wins, but refreshes run
// concurrently — the boot refresh (slow: migrations + 14 SELECTs) is NOT
// serialized with the writer-queue's post-apply refresh. A refresh that
// STARTED before a local mutation but FINISHED after the writer's own
// refresh used to clobber the newer snapshot; the overlay swap then fed
// the stale state through the diff-writer, escalating into a spurious
// blob-delete of the just-created row (server tombstone → data loss).
// Generation guard: a refresh may publish only while no later-started
// refresh has published first. SQLite writes are serialized, so a
// later-started refresh always reads an equal-or-newer DB state.
let refreshSeq = 0;
let publishedSeq = 0;

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
  const seq = ++refreshSeq;
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
  const merchantRules = prefsRow
    ? parseMerchantRules(prefsRow.prefs_json)
    : null;

  if (seq <= publishedSeq) return getCachedFinykSqliteState();
  publishedSeq = seq;
  setFinykSqliteCache({
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
    merchantRules,
    // eslint-disable-next-line no-restricted-syntax -- UTC-anchored refresh timestamp (updatedAt-style), not a Kyiv day boundary; pre-existing
    refreshedAt: new Date().toISOString(),
  });
  return getCachedFinykSqliteState();
}

/** `finyk_prefs.prefs_json` → правила мерчантів; зіпсований JSON = порожньо. */
function parseMerchantRules(raw: string | null | undefined): MerchantRule[] {
  const parsed = safeParseJson<unknown>(raw ?? null, null);
  if (!parsed || typeof parsed !== "object") return [];
  return sanitizeMerchantRules(
    (parsed as { merchantRules?: unknown }).merchantRules,
  );
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

/**
 * Оптимістично накладає `partial` на ВЖЕ прогрітий кеш (холодний кеш не
 * чіпає). Для chat-екшенів, що пишуть синхронно, а канонічний refresh іде
 * асинхронно після apply: без патча два екшени одного ходу (наприклад,
 * `set_monthly_plan{income}` і `set_monthly_plan{expense}`) читали б один
 * і той самий застарілий кеш, і другий стирав би поле першого.
 *
 * Не бампає `refreshedAt` і не сповіщає UI: наступний канонічний refresh
 * (він стартує пізніше й публікується останнім) перепише кеш істинним станом
 * із SQLite, тож розбіжність, якщо запис не дійшов до бази, самовиліковується.
 */
export function patchFinykSqliteStateCache(
  partial: Partial<SqliteFinykCache>,
): void {
  const cache = getCachedFinykSqliteState();
  if (cache.refreshedAt === null) return;
  setFinykSqliteCache({
    ...cache,
    ...partial,
    refreshedAt: cache.refreshedAt,
  });
}

/** Reset cache — used by tests and when the flag is toggled off. */
export function clearFinykSqliteCache(): void {
  setFinykSqliteCache({ ...EMPTY_FINYK_SQLITE_CACHE });
  refreshSeq = 0;
  publishedSeq = 0;
}

/**
 * Test-only seeder — overlays `partial` onto the empty cache and marks
 * it warm (`refreshedAt`). Lets unit tests for the off-React readers
 * (Hub chat-action executors) seed the canonical SQLite state without a
 * real sqlite-wasm round trip. Mirrors the routine
 * `__setRoutineSqliteStateCacheForTests` helper.
 */
export function __setFinykSqliteStateCacheForTests(
  partial: Partial<SqliteFinykCache>,
): void {
  setFinykSqliteCache({
    ...EMPTY_FINYK_SQLITE_CACHE,
    ...partial,
    refreshedAt: partial.refreshedAt ?? "2026-01-01T00:00:00.000Z",
  });
}

// Suppress unused-warning for the IdRow alias kept above for future
// per-row reads (e.g. raw `id` lookups).
export type { IdRow };
