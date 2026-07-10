/**
 * SQLite read path for the Mono cache mirror (PR #038).
 *
 * Mirrors the structure of `sqliteReader.ts` (PR #037) — a plain JS
 * cache + an async refresh helper. Consumers (currently the web
 * `useMonobankWebhook` hook) overlay their in-memory state from the
 * cache when the `feature.finyk.sqlite_v2.mono_mirror` flag is on.
 *
 * The cache only carries the slices we actually overlay back into
 * the hook today (`transactions`, `accounts`); historical snapshot
 * rows (`finyk_mono_account_snapshots`) are written but not read
 * here — analytics / dashboards consume them directly.
 *
 * Dual-write teardown (Phase 3): all production readers that previously
 * read from `finyk_tx_cache` / `finyk_info_cache` LS keys now consume
 * this module instead. The last-non-empty-transactions fallback preserves
 * `finykSubscriptionCalendar` subscription-date data during empty
 * transitional refreshes (mirrors the old `finyk_tx_cache_last_good` key).
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

interface MonoAccountCacheEntry {
  id: string;
  [k: string]: unknown;
}

export interface SqliteMonoMirrorCache {
  /** Mirrored Mono transactions, sorted newest → oldest by `mono_time`. */
  transactions: Transaction[];
  /** Mirrored Mono accounts (current state, no history). */
  accounts: MonoAccountCacheEntry[];
  /** ISO timestamp of the last successful refresh, or `null`. */
  refreshedAt: string | null;
}

const EMPTY_CACHE: SqliteMonoMirrorCache = {
  transactions: [],
  accounts: [],
  refreshedAt: null,
};

let cache: SqliteMonoMirrorCache = EMPTY_CACHE;

/**
 * Last-non-empty snapshot of transactions. Preserved across refreshes so
 * that a transitional empty refresh (e.g. page load before the first
 * Monobank fetch) does not erase subscription-calendar subscription data.
 * Cleared only by `clearFinykMonoMirrorCache` (test isolation).
 */
let lastGoodTransactions: Transaction[] = [];

/** Sync getter used by the read overlay inside the hook. */
export function getCachedFinykMonoMirrorState(): SqliteMonoMirrorCache {
  return cache;
}

/**
 * Sync getter with automatic last-non-empty-transactions fallback.
 *
 * Returns the current cache, but when `transactions` is empty and a
 * previous non-empty snapshot exists, substitutes the last-good list.
 * Use this wherever an empty transitional state would degrade UX
 * (e.g. `finykSubscriptionCalendar` — subscription dates are derived
 * from historical transactions and must survive cold-start refreshes).
 */
export function getCachedFinykMonoMirrorStateWithLastGood(): SqliteMonoMirrorCache {
  if (cache.transactions.length > 0) return cache;
  if (lastGoodTransactions.length === 0) return cache;
  return { ...cache, transactions: lastGoodTransactions };
}

/** Test-only escape hatch: clears the cache between specs. */
export function clearFinykMonoMirrorCache(): void {
  cache = EMPTY_CACHE;
  lastGoodTransactions = [];
}

interface TxRow extends Record<string, unknown> {
  data_json: string;
  mono_time: number;
}

interface AccountRow extends Record<string, unknown> {
  data_json: string;
}

function parseJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Refresh the Mono mirror cache from SQLite.
 *
 * Both queries run in parallel; failures bubble up so the caller (the
 * boot helper) can swallow them and fall back to LS reads.
 */
export async function refreshFinykMonoMirrorState(
  client: SqliteMigrationClient,
  userId: string,
): Promise<SqliteMonoMirrorCache> {
  if (!userId) {
    cache = EMPTY_CACHE;
    return cache;
  }

  const [txRows, accRows] = await Promise.all([
    client.all<TxRow>(
      `SELECT data_json, mono_time FROM finyk_mono_transactions
       WHERE user_id = ? ORDER BY mono_time DESC`,
      [userId],
    ),
    client.all<AccountRow>(
      `SELECT data_json FROM finyk_mono_accounts
       WHERE user_id = ? ORDER BY account_id ASC`,
      [userId],
    ),
  ]);

  const transactions: Transaction[] = [];
  for (const row of txRows) {
    const tx = parseJson<Transaction | null>(row.data_json, null);
    if (tx && typeof tx.id === "string") transactions.push(tx);
  }

  const accounts: MonoAccountCacheEntry[] = [];
  for (const row of accRows) {
    const acc = parseJson<MonoAccountCacheEntry | null>(row.data_json, null);
    if (acc && typeof acc.id === "string") accounts.push(acc);
  }

  if (transactions.length > 0) {
    lastGoodTransactions = transactions;
  }

  cache = {
    transactions,
    accounts,
    // eslint-disable-next-line no-restricted-syntax -- refreshedAt is a UTC wall-clock "last synced at" stamp, not a Kyiv business-day key.
    refreshedAt: new Date().toISOString(),
  };
  return cache;
}
