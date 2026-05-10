/**
 * SQLite read path for the Mono cache mirror on mobile.
 *
 * Mirrors `apps/web/src/modules/finyk/lib/monoMirrorReader.ts` — same
 * cache shape, same refresh helper. Mobile consumers
 * (`transactionsStore.ts`) overlay their state from this cache
 * unconditionally (Stage 13 PR #078 retired the flag).
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

/** Sync getter used by the read overlay inside the consuming store. */
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
 * Refresh the Mono mirror cache from SQLite. Both queries run in
 * parallel; failures bubble up so the caller (the boot helper) can
 * swallow them and fall back to MMKV reads.
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
