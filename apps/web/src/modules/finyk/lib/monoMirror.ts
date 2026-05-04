/**
 * SQLite-backed mirror for the three Mono caches that previously
 * lived only in localStorage:
 *
 *   - `finyk_tx_cache`           → `finyk_mono_transactions` (per-row, LWW
 *                                   on `mono_time`).
 *   - `finyk_info_cache`         → `finyk_mono_accounts` (per-account upsert)
 *                                   plus a snapshot row in
 *                                   `finyk_mono_account_snapshots` for
 *                                   balance history.
 *   - `finyk_tx_cache_last_good` → coexists with the primary mirror; we
 *                                   keep last-good as a JSON LS shim
 *                                   (it's a fallback snapshot, not a
 *                                   per-row source-of-truth).
 *
 * Stage 4 PR #038 of `docs/planning/storage-roadmap.md`.
 *
 * Mono is the external source-of-truth — write-ordering follows the
 * API's own `time` field (Unix seconds) rather than our local clock,
 * so re-runs of the same fetch are idempotent and out-of-order
 * deliveries (e.g. webhook reorderings, race with manual refetch) do
 * not silently overwrite newer rows.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

interface MonoAccountInput {
  id: string;
  balance?: number | null;
  creditLimit?: number | null;
  [k: string]: unknown;
}

/**
 * Upsert a batch of Mono transactions for a single user.
 *
 * Writes are LWW on Mono's own `time` field — only newer rows
 * overwrite existing ones. Rows where `mono_time` regresses are
 * silently kept (the existing row wins). Empty batches are no-ops.
 *
 * @returns the number of rows the caller attempted to upsert (after
 *   filtering out rows missing an `id`).
 */
export async function writeMonoTransactions(
  client: SqliteMigrationClient,
  userId: string,
  txs: ReadonlyArray<Transaction>,
): Promise<number> {
  if (txs.length === 0 || !userId) return 0;

  let attempted = 0;
  for (const tx of txs) {
    const txId = tx.id;
    if (!txId) continue;
    const accountId = tx.accountId ?? "";
    const monoTime = typeof tx.time === "number" ? tx.time : 0;
    const json = JSON.stringify(tx);
    await client.run(
      `INSERT INTO finyk_mono_transactions
         (user_id, tx_id, account_id, mono_time, data_json, imported_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, tx_id) DO UPDATE SET
         account_id = excluded.account_id,
         mono_time = excluded.mono_time,
         data_json = excluded.data_json,
         imported_at = datetime('now')
       WHERE excluded.mono_time >= finyk_mono_transactions.mono_time`,
      [userId, txId, accountId, monoTime, json],
    );
    attempted += 1;
  }
  return attempted;
}

/**
 * Upsert the user's Mono account list. Each account is keyed by
 * `(user_id, account_id)` and `data_json` carries the full DTO so
 * surfaces that need cashback type / IBAN / sendId can read them
 * back without a second fetch.
 *
 * @returns number of accounts the caller attempted to upsert.
 */
export async function writeMonoAccounts(
  client: SqliteMigrationClient,
  userId: string,
  accounts: ReadonlyArray<MonoAccountInput>,
): Promise<number> {
  if (accounts.length === 0 || !userId) return 0;

  let attempted = 0;
  for (const acc of accounts) {
    if (!acc.id) continue;
    const json = JSON.stringify(acc);
    await client.run(
      `INSERT INTO finyk_mono_accounts
         (user_id, account_id, data_json, imported_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, account_id) DO UPDATE SET
         data_json = excluded.data_json,
         imported_at = datetime('now')`,
      [userId, acc.id, json],
    );
    attempted += 1;
  }
  return attempted;
}

/**
 * Append a balance snapshot for each account at the given timestamp.
 *
 * Snapshots are immutable per `(user_id, account_id, snapshot_at)` —
 * ON CONFLICT DO NOTHING so re-fetching the same instant does not
 * grow the table. `balance` and `credit_limit` are denormalised
 * into typed columns so growth dashboards can SUM/AVG without
 * parsing `data_json`.
 *
 * @param snapshotAt - ISO-8601 timestamp; pass the same value for
 *   every account in a batch to record a coherent snapshot.
 * @returns number of snapshot rows the caller attempted to append.
 */
export async function writeMonoAccountSnapshots(
  client: SqliteMigrationClient,
  userId: string,
  accounts: ReadonlyArray<MonoAccountInput>,
  snapshotAt: string,
): Promise<number> {
  if (accounts.length === 0 || !userId || !snapshotAt) return 0;

  let attempted = 0;
  for (const acc of accounts) {
    if (!acc.id) continue;
    const balance = typeof acc.balance === "number" ? acc.balance : 0;
    const creditLimit =
      typeof acc.creditLimit === "number" ? acc.creditLimit : null;
    const json = JSON.stringify(acc);
    await client.run(
      `INSERT INTO finyk_mono_account_snapshots
         (user_id, account_id, snapshot_at, balance, credit_limit, data_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, account_id, snapshot_at) DO NOTHING`,
      [userId, acc.id, snapshotAt, balance, creditLimit, json],
    );
    attempted += 1;
  }
  return attempted;
}
