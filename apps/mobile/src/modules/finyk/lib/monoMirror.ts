/**
 * SQLite-backed mirror for the three Mono caches on mobile.
 *
 * Mirrors `apps/web/src/modules/finyk/lib/monoMirror.ts` exactly —
 * the upsert SQL is identical because the schema is identical.
 *
 * Stage 4 PR #038 of `docs/planning/storage-roadmap.md`.
 *
 * Mono is the external source-of-truth — write-ordering follows the
 * API's own `time` field (Unix seconds) rather than the local clock.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

interface MonoAccountInput {
  id: string;
  balance?: number | null;
  creditLimit?: number | null;
  [k: string]: unknown;
}

/** Upsert Mono transactions for one user (LWW on `mono_time`). */
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

/** Upsert the user's Mono account list (current state). */
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

/** Append a balance snapshot for each account at the given timestamp. */
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
