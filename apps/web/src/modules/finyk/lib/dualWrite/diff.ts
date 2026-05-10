/**
 * Pure-function diff between two Finyk LS-state snapshots, producing
 * the list of operations the dual-write layer must mirror to local
 * SQLite.
 *
 * Stage 4 PR #036 of `docs/planning/storage-roadmap.md`. Mirrors the
 * nutrition dual-write diff layer (PR #032) — same shape, same
 * semantics, separate types because the entity surface is different.
 *
 * Stage 8 PR #056k dropped the `feature.finyk.sqlite_v2.dual_write`
 * gate — the SQLite mirror now fires unconditionally whenever a
 * dual-write context is registered.
 *
 * Five entity classes are tracked across 14 LS keys. The mapping to
 * SQLite tables (created by PR #035 migration `039_finyk_tables.sql`):
 *
 *   - composite-PK tombstones (set membership)
 *     - `finyk_hidden`            → `finyk_hidden_accounts`
 *     - `finyk_hidden_txs`        → `finyk_hidden_transactions`
 *
 *   - per-row + JSONB blob (CRUD over arrays)
 *     - `finyk_budgets`           → `finyk_budgets`
 *     - `finyk_subs`              → `finyk_subscriptions`
 *     - `finyk_assets`            → `finyk_assets`
 *     - `finyk_debts`             → `finyk_debts`
 *     - `finyk_recv`              → `finyk_receivables`
 *     - `finyk_custom_cats_v1`    → `finyk_custom_categories`
 *     - `finyk_manual_expenses_v1`→ `finyk_manual_expenses`
 *
 *   - per-tx mapping (composite (user_id, transaction_id) PK)
 *     - `finyk_tx_cats`           → `finyk_tx_categories`     (string value)
 *     - `finyk_tx_splits`         → `finyk_tx_splits`         (jsonb array)
 *     - `finyk_mono_debt_linked`  → `finyk_mono_debt_links`   (jsonb array)
 *
 *   - time-series
 *     - `finyk_networth_history`  → `finyk_networth_history`  (composite (user_id, month))
 *
 *   - singleton prefs (per-user)
 *     - `finyk_monthly_plan` + `finyk_show_balance_v1` → `finyk_prefs`
 *
 * `finyk_tx_filters_v1` is intentionally NOT yet wired here — there is
 * no LS source on `main` today; the table waits for the future filter
 * persistence work. The diff layer omits it entirely until the LS
 * shape lands.
 */

// -----------------------------------------------------------------------
// Snapshot shapes — loose mirrors of the domain types, kept minimal so
// the diff layer doesn't pull in the full domain package. The adapter
// reads these to produce SQL statements.
// -----------------------------------------------------------------------

/** Set-membership entry for the composite-PK tombstone tables. */
export interface FinykIdEntry {
  /** Stable external id (account id / Mono transaction id). */
  readonly id: string;
}

/**
 * Per-row blob entry. `dataJson` is the verbatim JSON serialisation of
 * the LS shape — the adapter writes it to `data_json` unchanged so
 * future schema evolution doesn't require re-shaping at the dual-write
 * boundary.
 */
export interface FinykBlobEntry {
  readonly id: string;
  readonly dataJson: string;
}

/** Per-tx category override (`finyk_tx_cats`). */
export interface FinykTxCategoryEntry {
  readonly transactionId: string;
  readonly categoryId: string;
}

/** Per-tx splits (`finyk_tx_splits`). */
export interface FinykTxSplitsEntry {
  readonly transactionId: string;
  readonly splitsJson: string;
}

/** Per-tx mono-debt links (`finyk_mono_debt_linked`). */
export interface FinykMonoDebtLinkEntry {
  readonly transactionId: string;
  readonly debtIdsJson: string;
}

/** Time-series networth row (`finyk_networth_history`). */
export interface FinykNetworthEntry {
  readonly month: string;
  readonly networth: number;
}

/** Singleton per-user prefs (`finyk_prefs`). */
export interface FinykPrefsSnapshot {
  /** Whole MonthlyPlan blob serialised to JSON. */
  readonly monthlyPlanJson: string;
  /** `finyk_show_balance_v1` raw boolean state. */
  readonly showBalance: boolean;
  /**
   * Mono transaction ids excluded from statistics. JSON-encoded once
   * by the extractor — diff layer compares strings, adapter writes
   * verbatim into `finyk_prefs.excluded_stat_tx_ids_json`.
   * (Stage 13 / PR #075 — was `finyk_excluded_stat_txs` LS-only.)
   */
  readonly excludedStatTxIdsJson: string;
  /**
   * Recurring-banner ids the user dismissed. Same shape as above —
   * JSON-encoded array of strings; adapter writes verbatim into
   * `finyk_prefs.dismissed_recurring_json`.
   * (Stage 13 / PR #075 — was `finyk_rec_dismissed` LS-only.)
   */
  readonly dismissedRecurringJson: string;
}

// -----------------------------------------------------------------------
// State — loose mirror of useFinykStorageSlots() across all LS keys
// -----------------------------------------------------------------------

export interface FinykDualWriteState {
  readonly hiddenAccounts: readonly FinykIdEntry[];
  readonly hiddenTransactions: readonly FinykIdEntry[];
  readonly budgets: readonly FinykBlobEntry[];
  readonly subscriptions: readonly FinykBlobEntry[];
  readonly assets: readonly FinykBlobEntry[];
  readonly debts: readonly FinykBlobEntry[];
  readonly receivables: readonly FinykBlobEntry[];
  readonly customCategories: readonly FinykBlobEntry[];
  readonly manualExpenses: readonly FinykBlobEntry[];
  readonly txCategories: readonly FinykTxCategoryEntry[];
  readonly txSplits: readonly FinykTxSplitsEntry[];
  readonly monoDebtLinks: readonly FinykMonoDebtLinkEntry[];
  readonly networthHistory: readonly FinykNetworthEntry[];
  readonly prefs: FinykPrefsSnapshot | null;
}

export const EMPTY_FINYK_STATE: FinykDualWriteState = {
  hiddenAccounts: [],
  hiddenTransactions: [],
  budgets: [],
  subscriptions: [],
  assets: [],
  debts: [],
  receivables: [],
  customCategories: [],
  manualExpenses: [],
  txCategories: [],
  txSplits: [],
  monoDebtLinks: [],
  networthHistory: [],
  prefs: null,
};

// -----------------------------------------------------------------------
// Op types
// -----------------------------------------------------------------------

export type FinykIdTable =
  | "finyk_hidden_accounts"
  | "finyk_hidden_transactions";

export type FinykBlobTable =
  | "finyk_budgets"
  | "finyk_subscriptions"
  | "finyk_assets"
  | "finyk_debts"
  | "finyk_receivables"
  | "finyk_custom_categories"
  | "finyk_manual_expenses";

export interface IdUpsertOp {
  readonly kind: "id-upsert";
  readonly table: FinykIdTable;
  readonly entry: FinykIdEntry;
}

export interface IdDeleteOp {
  readonly kind: "id-delete";
  readonly table: FinykIdTable;
  readonly id: string;
}

export interface BlobUpsertOp {
  readonly kind: "blob-upsert";
  readonly table: FinykBlobTable;
  readonly entry: FinykBlobEntry;
}

export interface BlobDeleteOp {
  readonly kind: "blob-delete";
  readonly table: FinykBlobTable;
  readonly id: string;
}

export interface TxCategoryUpsertOp {
  readonly kind: "tx-category-upsert";
  readonly entry: FinykTxCategoryEntry;
}

export interface TxCategoryDeleteOp {
  readonly kind: "tx-category-delete";
  readonly transactionId: string;
}

export interface TxSplitsUpsertOp {
  readonly kind: "tx-splits-upsert";
  readonly entry: FinykTxSplitsEntry;
}

export interface TxSplitsDeleteOp {
  readonly kind: "tx-splits-delete";
  readonly transactionId: string;
}

export interface MonoDebtLinkUpsertOp {
  readonly kind: "mono-debt-link-upsert";
  readonly entry: FinykMonoDebtLinkEntry;
}

export interface MonoDebtLinkDeleteOp {
  readonly kind: "mono-debt-link-delete";
  readonly transactionId: string;
}

export interface NetworthUpsertOp {
  readonly kind: "networth-upsert";
  readonly entry: FinykNetworthEntry;
}

export interface PrefsUpsertOp {
  readonly kind: "prefs-upsert";
  readonly prefs: FinykPrefsSnapshot;
}

export type FinykDualWriteOp =
  | IdUpsertOp
  | IdDeleteOp
  | BlobUpsertOp
  | BlobDeleteOp
  | TxCategoryUpsertOp
  | TxCategoryDeleteOp
  | TxSplitsUpsertOp
  | TxSplitsDeleteOp
  | MonoDebtLinkUpsertOp
  | MonoDebtLinkDeleteOp
  | NetworthUpsertOp
  | PrefsUpsertOp;

// -----------------------------------------------------------------------
// Diff
// -----------------------------------------------------------------------

/**
 * Compute the dual-write operation list for the transition `prev → next`.
 *
 * Stable iteration order:
 *   1. id-tables (`finyk_hidden_accounts`, `finyk_hidden_transactions`)
 *   2. blob-tables in declaration order (budgets → subs → assets → …)
 *   3. tx-categories / tx-splits / mono-debt-links (id asc)
 *   4. networth-history (month asc)
 *   5. prefs-upsert (singleton, last)
 */
export function diffFinykDualWriteOps(
  prev: FinykDualWriteState,
  next: FinykDualWriteState,
): FinykDualWriteOp[] {
  const ops: FinykDualWriteOp[] = [];

  // --- ID tables ---
  diffById(
    prev.hiddenAccounts,
    next.hiddenAccounts,
    () => false, // no payload — set membership only
    (entry) =>
      ops.push({ kind: "id-upsert", table: "finyk_hidden_accounts", entry }),
    (id) => ops.push({ kind: "id-delete", table: "finyk_hidden_accounts", id }),
  );

  diffById(
    prev.hiddenTransactions,
    next.hiddenTransactions,
    () => false,
    (entry) =>
      ops.push({
        kind: "id-upsert",
        table: "finyk_hidden_transactions",
        entry,
      }),
    (id) =>
      ops.push({ kind: "id-delete", table: "finyk_hidden_transactions", id }),
  );

  // --- Per-row blobs ---
  diffBlobs(prev.budgets, next.budgets, "finyk_budgets", ops);
  diffBlobs(prev.subscriptions, next.subscriptions, "finyk_subscriptions", ops);
  diffBlobs(prev.assets, next.assets, "finyk_assets", ops);
  diffBlobs(prev.debts, next.debts, "finyk_debts", ops);
  diffBlobs(prev.receivables, next.receivables, "finyk_receivables", ops);
  diffBlobs(
    prev.customCategories,
    next.customCategories,
    "finyk_custom_categories",
    ops,
  );
  diffBlobs(
    prev.manualExpenses,
    next.manualExpenses,
    "finyk_manual_expenses",
    ops,
  );

  // --- Per-tx category overrides ---
  diffByKey(
    prev.txCategories,
    next.txCategories,
    (e) => e.transactionId,
    (a, b) => a.categoryId !== b.categoryId,
    (entry) => ops.push({ kind: "tx-category-upsert", entry }),
    (transactionId) => ops.push({ kind: "tx-category-delete", transactionId }),
  );

  // --- Per-tx splits ---
  diffByKey(
    prev.txSplits,
    next.txSplits,
    (e) => e.transactionId,
    (a, b) => a.splitsJson !== b.splitsJson,
    (entry) => ops.push({ kind: "tx-splits-upsert", entry }),
    (transactionId) => ops.push({ kind: "tx-splits-delete", transactionId }),
  );

  // --- Per-tx mono-debt links ---
  diffByKey(
    prev.monoDebtLinks,
    next.monoDebtLinks,
    (e) => e.transactionId,
    (a, b) => a.debtIdsJson !== b.debtIdsJson,
    (entry) => ops.push({ kind: "mono-debt-link-upsert", entry }),
    (transactionId) =>
      ops.push({ kind: "mono-debt-link-delete", transactionId }),
  );

  // --- Time-series: networth_history ---
  // No deletes — history is append/replace-only per month.
  diffByKey(
    prev.networthHistory,
    next.networthHistory,
    (e) => e.month,
    (a, b) => a.networth !== b.networth,
    (entry) => ops.push({ kind: "networth-upsert", entry }),
    () => {
      /* no delete op for time-series */
    },
  );

  // --- Singleton prefs ---
  if (prefsChanged(prev.prefs, next.prefs) && next.prefs) {
    ops.push({ kind: "prefs-upsert", prefs: next.prefs });
  }

  return ops;
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function diffById(
  prev: readonly FinykIdEntry[],
  next: readonly FinykIdEntry[],
  hasChanged: (a: FinykIdEntry, b: FinykIdEntry) => boolean,
  onUpsert: (entry: FinykIdEntry) => void,
  onDelete: (id: string) => void,
): void {
  const prevMap = new Map<string, FinykIdEntry>();
  for (const item of prev) prevMap.set(item.id, item);
  const nextMap = new Map<string, FinykIdEntry>();
  for (const item of next) nextMap.set(item.id, item);

  const sortedNextIds = [...nextMap.keys()].sort();
  for (const id of sortedNextIds) {
    const nextItem = nextMap.get(id)!;
    const prevItem = prevMap.get(id);
    if (!prevItem) onUpsert(nextItem);
    else if (prevItem !== nextItem && hasChanged(prevItem, nextItem))
      onUpsert(nextItem);
  }

  const sortedPrevIds = [...prevMap.keys()].sort();
  for (const id of sortedPrevIds) {
    if (!nextMap.has(id)) onDelete(id);
  }
}

function diffBlobs(
  prev: readonly FinykBlobEntry[],
  next: readonly FinykBlobEntry[],
  table: FinykBlobTable,
  ops: FinykDualWriteOp[],
): void {
  const prevMap = new Map<string, FinykBlobEntry>();
  for (const item of prev) prevMap.set(item.id, item);
  const nextMap = new Map<string, FinykBlobEntry>();
  for (const item of next) nextMap.set(item.id, item);

  const sortedNextIds = [...nextMap.keys()].sort();
  for (const id of sortedNextIds) {
    const nextItem = nextMap.get(id)!;
    const prevItem = prevMap.get(id);
    if (!prevItem) {
      ops.push({ kind: "blob-upsert", table, entry: nextItem });
    } else if (
      prevItem !== nextItem &&
      prevItem.dataJson !== nextItem.dataJson
    ) {
      ops.push({ kind: "blob-upsert", table, entry: nextItem });
    }
  }

  const sortedPrevIds = [...prevMap.keys()].sort();
  for (const id of sortedPrevIds) {
    if (!nextMap.has(id)) {
      ops.push({ kind: "blob-delete", table, id });
    }
  }
}

function diffByKey<T>(
  prev: readonly T[],
  next: readonly T[],
  getKey: (entry: T) => string,
  hasChanged: (prev: T, next: T) => boolean,
  onUpsert: (entry: T) => void,
  onDelete: (key: string) => void,
): void {
  const prevMap = new Map<string, T>();
  for (const item of prev) prevMap.set(getKey(item), item);
  const nextMap = new Map<string, T>();
  for (const item of next) nextMap.set(getKey(item), item);

  const sortedNextKeys = [...nextMap.keys()].sort();
  for (const key of sortedNextKeys) {
    const nextItem = nextMap.get(key)!;
    const prevItem = prevMap.get(key);
    if (!prevItem) onUpsert(nextItem);
    else if (prevItem !== nextItem && hasChanged(prevItem, nextItem))
      onUpsert(nextItem);
  }

  const sortedPrevKeys = [...prevMap.keys()].sort();
  for (const key of sortedPrevKeys) {
    if (!nextMap.has(key)) onDelete(key);
  }
}

function prefsChanged(
  prev: FinykPrefsSnapshot | null,
  next: FinykPrefsSnapshot | null,
): boolean {
  if (prev === next) return false;
  if (!prev || !next) return prev !== next;
  return (
    prev.monthlyPlanJson !== next.monthlyPlanJson ||
    prev.showBalance !== next.showBalance ||
    prev.excludedStatTxIdsJson !== next.excludedStatTxIdsJson ||
    prev.dismissedRecurringJson !== next.dismissedRecurringJson
  );
}
