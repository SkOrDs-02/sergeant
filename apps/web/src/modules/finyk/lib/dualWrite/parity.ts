import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type { FinykDualWriteState } from "./diff.js";

/**
 * Parity probe for the Finyk SQLite dual-write layer.
 *
 * Stage 8 §3 of `docs/planning/storage-roadmap.md` defines a
 * `<module>.sqlite.dualwrite.parity` decision-gate metric: whenever
 * the LS-derived state and the SQLite-derived state should be
 * identical (which is the steady-state invariant once the dual-write
 * `applied` outcome returns success), they are compared and a
 * `recordParityCheck` tick is emitted on the global Sentry scope.
 *
 * The orchestrator (`./index.ts`) calls this helper after every
 * successful `applyFinykDualWriteOps` apply. Finyk SQLite is the
 * largest of the four modules — five entity classes across thirteen
 * tables that round-trip through this dual-write boundary:
 *
 *   1. **Blob tables (7)** — top-level rows keyed by `id` (UUID) with
 *      `deleted_at`: `finyk_budgets`, `finyk_subscriptions`,
 *      `finyk_assets`, `finyk_debts`, `finyk_receivables`,
 *      `finyk_custom_categories`, `finyk_manual_expenses`.
 *   2. **Tombstone id-tables (2)** — composite PK on
 *      `(user_id, account_id|transaction_id)` with `deleted_at`:
 *      `finyk_hidden_accounts` (key column `account_id`),
 *      `finyk_hidden_transactions` (key column `transaction_id`).
 *      The LS shape is `{ id }` where `id` is the external Mono id.
 *   3. **Per-tx mappings (3)** — composite PK on
 *      `(user_id, transaction_id)` without `deleted_at`:
 *      `finyk_tx_categories`, `finyk_tx_splits`,
 *      `finyk_mono_debt_links`. "No mapping" is the same as the row
 *      not existing — the sync apply path treats `delete` as
 *      `DELETE FROM`.
 *   4. **Time-series (1)** — composite PK on `(user_id, month)`
 *      without `deleted_at`: `finyk_networth_history`. `month` is a
 *      TEXT `YYYY-MM` to mirror the LS shape verbatim.
 *   5. **Singleton prefs (1)** — `user_id` PK, no `id`, no
 *      `deleted_at`: `finyk_prefs`. Compared as a presence boolean:
 *      LS-side has prefs iff `next.prefs !== null`; SQLite-side iff
 *      a row exists for `user_id`.
 *
 * Mono cache mirrors (`finyk_mono_transactions`, `finyk_mono_accounts`,
 * `finyk_mono_account_snapshots`) are NOT compared here. They are not
 * round-tripped through this dual-write — they are written directly
 * by the Mono import path with LWW against Mono's own `time` field —
 * so they are not part of the LS↔SQLite parity invariant the Stage 8
 * decision-gate is gated on.
 *
 * `finyk_tx_filters` is also NOT compared here. The diff layer
 * intentionally omits it (`./diff.ts` line 37–40) because there is no
 * LS source on `main` today; until the LS shape lands, comparing the
 * SQLite side to nothing would emit gratuitous mismatches.
 *
 * The probe is best-effort: it must NEVER throw, and any read failure
 * is surfaced as a `read.fallback` — distinct from a real parity
 * mismatch — so triage can tell `SELECT failing` apart from `LS and
 * SQLite genuinely disagree`. The orchestrator implements that
 * distinction.
 */

interface ParityProbeOutcome {
  result: "match" | "mismatch";
  details: Record<string, unknown>;
}

interface SetCompareOutcome {
  match: boolean;
  lsOnly: number;
  sqliteOnly: number;
}

/**
 * Read the active Finyk entity ids/keys from SQLite for `userId` and
 * compare them to the LS-derived `next` snapshot. The two are
 * expected to be byte-identical right after a successful dual-write
 * apply — any divergence is a Stage 8 decision-gate signal.
 *
 * The function may throw if any of the SQLite reads fail. The caller
 * is expected to catch and route that to `recordReadFallback` rather
 * than `recordParityCheck("…", "mismatch", …)` — see `./index.ts`.
 */
export async function probeFinykParity(
  client: SqliteMigrationClient,
  userId: string,
  next: FinykDualWriteState,
): Promise<ParityProbeOutcome> {
  // --- Blob tables (7) ---
  const sqliteBudgets = await readBlobIds(client, "finyk_budgets", userId);
  const sqliteSubscriptions = await readBlobIds(
    client,
    "finyk_subscriptions",
    userId,
  );
  const sqliteAssets = await readBlobIds(client, "finyk_assets", userId);
  const sqliteDebts = await readBlobIds(client, "finyk_debts", userId);
  const sqliteReceivables = await readBlobIds(
    client,
    "finyk_receivables",
    userId,
  );
  const sqliteCustomCategories = await readBlobIds(
    client,
    "finyk_custom_categories",
    userId,
  );
  const sqliteManualExpenses = await readBlobIds(
    client,
    "finyk_manual_expenses",
    userId,
  );

  // --- Tombstone id-tables (2) ---
  const sqliteHiddenAccounts = await readKeyedIds(
    client,
    "finyk_hidden_accounts",
    "account_id",
    userId,
  );
  const sqliteHiddenTransactions = await readKeyedIds(
    client,
    "finyk_hidden_transactions",
    "transaction_id",
    userId,
  );

  // --- Per-tx mappings (3) — no deleted_at ---
  const sqliteTxCategories = await readKeyedIdsNoSoftDelete(
    client,
    "finyk_tx_categories",
    "transaction_id",
    userId,
  );
  const sqliteTxSplits = await readKeyedIdsNoSoftDelete(
    client,
    "finyk_tx_splits",
    "transaction_id",
    userId,
  );
  const sqliteMonoDebtLinks = await readKeyedIdsNoSoftDelete(
    client,
    "finyk_mono_debt_links",
    "transaction_id",
    userId,
  );

  // --- Time-series (1) — no deleted_at ---
  const sqliteNetworthHistory = await readKeyedIdsNoSoftDelete(
    client,
    "finyk_networth_history",
    "month",
    userId,
  );

  // --- Singleton prefs (1) ---
  const sqliteHasPrefs = await readPrefsExists(client, userId);

  // --- Build LS-side sets ---
  const lsBudgets = buildIdSet(next.budgets);
  const lsSubscriptions = buildIdSet(next.subscriptions);
  const lsAssets = buildIdSet(next.assets);
  const lsDebts = buildIdSet(next.debts);
  const lsReceivables = buildIdSet(next.receivables);
  const lsCustomCategories = buildIdSet(next.customCategories);
  const lsManualExpenses = buildIdSet(next.manualExpenses);
  const lsHiddenAccounts = buildIdSet(next.hiddenAccounts);
  const lsHiddenTransactions = buildIdSet(next.hiddenTransactions);
  const lsTxCategories = buildKeySet(next.txCategories, "transactionId");
  const lsTxSplits = buildKeySet(next.txSplits, "transactionId");
  const lsMonoDebtLinks = buildKeySet(next.monoDebtLinks, "transactionId");
  const lsNetworthHistory = buildKeySet(next.networthHistory, "month");
  const lsHasPrefs = next.prefs !== null && next.prefs !== undefined;

  // --- Compare ---
  const budgetsDiff = compareSets(lsBudgets, sqliteBudgets);
  const subscriptionsDiff = compareSets(lsSubscriptions, sqliteSubscriptions);
  const assetsDiff = compareSets(lsAssets, sqliteAssets);
  const debtsDiff = compareSets(lsDebts, sqliteDebts);
  const receivablesDiff = compareSets(lsReceivables, sqliteReceivables);
  const customCategoriesDiff = compareSets(
    lsCustomCategories,
    sqliteCustomCategories,
  );
  const manualExpensesDiff = compareSets(
    lsManualExpenses,
    sqliteManualExpenses,
  );
  const hiddenAccountsDiff = compareSets(
    lsHiddenAccounts,
    sqliteHiddenAccounts,
  );
  const hiddenTransactionsDiff = compareSets(
    lsHiddenTransactions,
    sqliteHiddenTransactions,
  );
  const txCategoriesDiff = compareSets(lsTxCategories, sqliteTxCategories);
  const txSplitsDiff = compareSets(lsTxSplits, sqliteTxSplits);
  const monoDebtLinksDiff = compareSets(lsMonoDebtLinks, sqliteMonoDebtLinks);
  const networthHistoryDiff = compareSets(
    lsNetworthHistory,
    sqliteNetworthHistory,
  );
  const prefsMatch = lsHasPrefs === sqliteHasPrefs;

  const allMatch =
    budgetsDiff.match &&
    subscriptionsDiff.match &&
    assetsDiff.match &&
    debtsDiff.match &&
    receivablesDiff.match &&
    customCategoriesDiff.match &&
    manualExpensesDiff.match &&
    hiddenAccountsDiff.match &&
    hiddenTransactionsDiff.match &&
    txCategoriesDiff.match &&
    txSplitsDiff.match &&
    monoDebtLinksDiff.match &&
    networthHistoryDiff.match &&
    prefsMatch;

  if (allMatch) {
    return {
      result: "match",
      details: {
        budgets: { ls: lsBudgets.size, sqlite: sqliteBudgets.size },
        subscriptions: {
          ls: lsSubscriptions.size,
          sqlite: sqliteSubscriptions.size,
        },
        assets: { ls: lsAssets.size, sqlite: sqliteAssets.size },
        debts: { ls: lsDebts.size, sqlite: sqliteDebts.size },
        receivables: { ls: lsReceivables.size, sqlite: sqliteReceivables.size },
        customCategories: {
          ls: lsCustomCategories.size,
          sqlite: sqliteCustomCategories.size,
        },
        manualExpenses: {
          ls: lsManualExpenses.size,
          sqlite: sqliteManualExpenses.size,
        },
        hiddenAccounts: {
          ls: lsHiddenAccounts.size,
          sqlite: sqliteHiddenAccounts.size,
        },
        hiddenTransactions: {
          ls: lsHiddenTransactions.size,
          sqlite: sqliteHiddenTransactions.size,
        },
        txCategories: {
          ls: lsTxCategories.size,
          sqlite: sqliteTxCategories.size,
        },
        txSplits: { ls: lsTxSplits.size, sqlite: sqliteTxSplits.size },
        monoDebtLinks: {
          ls: lsMonoDebtLinks.size,
          sqlite: sqliteMonoDebtLinks.size,
        },
        networthHistory: {
          ls: lsNetworthHistory.size,
          sqlite: sqliteNetworthHistory.size,
        },
        prefs: { ls: lsHasPrefs, sqlite: sqliteHasPrefs },
      },
    };
  }

  // Mismatch: surface the symmetric-difference cardinality per entity
  // class so triage can read the bucket without a follow-up query. We
  // deliberately do NOT include the actual ids — Mono account / tx
  // ids and budget / subscription / asset / debt / receivable ids are
  // user-data and Sentry breadcrumbs leak into events.
  return {
    result: "mismatch",
    details: {
      budgets: detailWithDiff(lsBudgets, sqliteBudgets, budgetsDiff),
      subscriptions: detailWithDiff(
        lsSubscriptions,
        sqliteSubscriptions,
        subscriptionsDiff,
      ),
      assets: detailWithDiff(lsAssets, sqliteAssets, assetsDiff),
      debts: detailWithDiff(lsDebts, sqliteDebts, debtsDiff),
      receivables: detailWithDiff(
        lsReceivables,
        sqliteReceivables,
        receivablesDiff,
      ),
      customCategories: detailWithDiff(
        lsCustomCategories,
        sqliteCustomCategories,
        customCategoriesDiff,
      ),
      manualExpenses: detailWithDiff(
        lsManualExpenses,
        sqliteManualExpenses,
        manualExpensesDiff,
      ),
      hiddenAccounts: detailWithDiff(
        lsHiddenAccounts,
        sqliteHiddenAccounts,
        hiddenAccountsDiff,
      ),
      hiddenTransactions: detailWithDiff(
        lsHiddenTransactions,
        sqliteHiddenTransactions,
        hiddenTransactionsDiff,
      ),
      txCategories: detailWithDiff(
        lsTxCategories,
        sqliteTxCategories,
        txCategoriesDiff,
      ),
      txSplits: detailWithDiff(lsTxSplits, sqliteTxSplits, txSplitsDiff),
      monoDebtLinks: detailWithDiff(
        lsMonoDebtLinks,
        sqliteMonoDebtLinks,
        monoDebtLinksDiff,
      ),
      networthHistory: detailWithDiff(
        lsNetworthHistory,
        sqliteNetworthHistory,
        networthHistoryDiff,
      ),
      prefs: { ls: lsHasPrefs, sqlite: sqliteHasPrefs },
    },
  };
}

/**
 * Read active ids from a Finyk blob table (per-row JSONB blob with
 * `id` UUID PK + `deleted_at` soft-delete column).
 *
 * The `table` parameter is a typed union of seven literal strings, so
 * there is no SQL-injection surface from string interpolation here.
 */
async function readBlobIds(
  client: SqliteMigrationClient,
  table:
    | "finyk_budgets"
    | "finyk_subscriptions"
    | "finyk_assets"
    | "finyk_debts"
    | "finyk_receivables"
    | "finyk_custom_categories"
    | "finyk_manual_expenses",
  userId: string,
): Promise<Set<string>> {
  const rows = await client.all<{ id: string }>(
    `SELECT id FROM ${table}
       WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );
  const out = new Set<string>();
  for (const row of rows) {
    if (typeof row.id === "string" && row.id.length > 0) out.add(row.id);
  }
  return out;
}

/**
 * Read active keys from a tombstone id-table (composite PK on
 * `(user_id, key_col)` with `deleted_at`). Used for
 * `finyk_hidden_accounts` and `finyk_hidden_transactions`.
 *
 * Both `table` and `keyColumn` are typed unions of literal strings,
 * so the interpolation is safe.
 */
async function readKeyedIds(
  client: SqliteMigrationClient,
  table: "finyk_hidden_accounts" | "finyk_hidden_transactions",
  keyColumn: "account_id" | "transaction_id",
  userId: string,
): Promise<Set<string>> {
  const rows = await client.all<Record<string, unknown>>(
    `SELECT ${keyColumn} AS key FROM ${table}
       WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );
  return collectStringKeys(rows);
}

/**
 * Read keys from tables that have no `deleted_at` column. Used for
 * `finyk_tx_categories`, `finyk_tx_splits`, `finyk_mono_debt_links`,
 * and `finyk_networth_history`.
 */
async function readKeyedIdsNoSoftDelete(
  client: SqliteMigrationClient,
  table:
    | "finyk_tx_categories"
    | "finyk_tx_splits"
    | "finyk_mono_debt_links"
    | "finyk_networth_history",
  keyColumn: "transaction_id" | "month",
  userId: string,
): Promise<Set<string>> {
  const rows = await client.all<Record<string, unknown>>(
    `SELECT ${keyColumn} AS key FROM ${table}
       WHERE user_id = ?`,
    [userId],
  );
  return collectStringKeys(rows);
}

async function readPrefsExists(
  client: SqliteMigrationClient,
  userId: string,
): Promise<boolean> {
  // `finyk_prefs` is a singleton row keyed by `user_id` — there is no
  // `id` column and no soft-delete column. A presence check is the
  // only meaningful parity signal.
  const rows = await client.all<{ user_id: string }>(
    `SELECT user_id FROM finyk_prefs WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  return rows.length > 0;
}

function collectStringKeys(
  rows: readonly Record<string, unknown>[],
): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    const key = row.key;
    if (typeof key === "string" && key.length > 0) out.add(key);
  }
  return out;
}

function buildIdSet(items: readonly { id: string }[]): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(items)) return out;
  for (const item of items) {
    if (
      item &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      item.id.length > 0
    ) {
      out.add(item.id);
    }
  }
  return out;
}

function buildKeySet<T extends object>(
  items: readonly T[],
  keyName: keyof T,
): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(items)) return out;
  for (const item of items) {
    if (item && typeof item === "object") {
      const key = (item as Record<string, unknown>)[keyName as string];
      if (typeof key === "string" && key.length > 0) out.add(key);
    }
  }
  return out;
}

function compareSets(ls: Set<string>, sqlite: Set<string>): SetCompareOutcome {
  if (ls.size === sqlite.size) {
    let allMatch = true;
    for (const key of ls) {
      if (!sqlite.has(key)) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return { match: true, lsOnly: 0, sqliteOnly: 0 };
  }
  let lsOnly = 0;
  let sqliteOnly = 0;
  for (const key of ls) if (!sqlite.has(key)) lsOnly += 1;
  for (const key of sqlite) if (!ls.has(key)) sqliteOnly += 1;
  return { match: false, lsOnly, sqliteOnly };
}

function detailWithDiff(
  ls: Set<string>,
  sqlite: Set<string>,
  diff: SetCompareOutcome,
): Record<string, unknown> {
  return {
    ls: ls.size,
    sqlite: sqlite.size,
    lsOnly: diff.lsOnly,
    sqliteOnly: diff.sqliteOnly,
  };
}
