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

/** Sync getter used by the read overlay inside the hook. */
export function getCachedFinykMonoMirrorState(): SqliteMonoMirrorCache {
  return cache;
}

/** Test-only escape hatch: clears the cache between specs. */
export function clearFinykMonoMirrorCache(): void {
  cache = EMPTY_CACHE;
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

  cache = {
    transactions,
    accounts,
    refreshedAt: new Date().toISOString(),
  };
  return cache;
}
