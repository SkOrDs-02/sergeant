import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type {
  FinykBlobEntry,
  FinykBlobTable,
  FinykDualWriteOp,
  FinykIdEntry,
  FinykIdTable,
  FinykMonoDebtLinkEntry,
  FinykNetworthEntry,
  FinykPrefsSnapshot,
  FinykTxCategoryEntry,
  FinykTxSplitsEntry,
} from "./diff.js";

/**
 * Async SQLite-side adapter for the Finyk dual-write layer.
 *
 * Stage 4 PR #036 of `docs/planning/storage-roadmap.md`. Mirror of
 * `apps/web/src/modules/nutrition/lib/dualWrite/adapter.ts` with the
 * finyk entity types / table names. Takes the `FinykDualWriteOp[]`
 * produced by `diffFinykDualWriteOps` and writes them to the local
 * `finyk_*` tables defined by migration `039_finyk_tables.sql` and the
 * SQLite parallel in `packages/db-schema/src/sqlite/finyk.ts`.
 *
 * Design notes (same as nutrition adapter):
 *
 * - Best-effort: every op is wrapped in try/catch. A single failed op
 *   does NOT abort the rest.
 * - Idempotent: upserts use ON CONFLICT(...) DO UPDATE with LWW guard.
 * - LWW guard: updates only apply when the incoming `clientTs` is
 *   strictly newer than the local `updated_at`.
 * - Soft-delete on tables that have `deleted_at`; hard `DELETE` on
 *   per-tx mappings (no soft-delete column there — absence is the
 *   "no override" state, by design).
 */

export interface ApplyDualWriteOptions {
  readonly userId: string;
  readonly clientTs: string;
  readonly logger?: DualWriteLogger;
}

export type DualWriteLogger = (
  level: "warn" | "info",
  message: string,
  meta?: Record<string, unknown>,
) => void;

export interface ApplyDualWriteResult {
  readonly applied: number;
  readonly errored: number;
  readonly skipped: number;
}

const DEFAULT_LOGGER: DualWriteLogger = (level, message, meta) => {
  if (level === "warn") {
    console.warn(`[finyk.dualWrite] ${message}`, meta ?? {});
  }
};

export async function applyFinykDualWriteOps(
  client: SqliteMigrationClient,
  ops: readonly FinykDualWriteOp[],
  options: ApplyDualWriteOptions,
): Promise<ApplyDualWriteResult> {
  if (ops.length === 0) {
    return { applied: 0, errored: 0, skipped: 0 };
  }
  const logger = options.logger ?? DEFAULT_LOGGER;
  let applied = 0;
  let errored = 0;
  let skipped = 0;

  for (const op of ops) {
    try {
      const outcome = await applyOne(client, op, options);
      if (outcome === "applied") applied += 1;
      else skipped += 1;
    } catch (err) {
      errored += 1;
      logger("warn", "dual-write op failed", {
        op: op.kind,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { applied, errored, skipped };
}

type ApplyOutcome = "applied" | "skipped";

async function applyOne(
  client: SqliteMigrationClient,
  op: FinykDualWriteOp,
  options: ApplyDualWriteOptions,
): Promise<ApplyOutcome> {
  const { userId, clientTs } = options;
  switch (op.kind) {
    case "id-upsert":
      await upsertIdEntry(client, op.table, op.entry, userId, clientTs);
      return "applied";

    case "id-delete":
      await softDeleteIdEntry(client, op.table, op.id, userId, clientTs);
      return "applied";

    case "blob-upsert":
      await upsertBlobEntry(client, op.table, op.entry, userId, clientTs);
      return "applied";

    case "blob-delete":
      await softDeleteBlobEntry(client, op.table, op.id, userId, clientTs);
      return "applied";

    case "tx-category-upsert":
      await upsertTxCategory(client, op.entry, userId, clientTs);
      return "applied";

    case "tx-category-delete":
      await deleteTxCategory(client, op.transactionId, userId);
      return "applied";

    case "tx-splits-upsert":
      await upsertTxSplits(client, op.entry, userId, clientTs);
      return "applied";

    case "tx-splits-delete":
      await deleteTxSplits(client, op.transactionId, userId);
      return "applied";

    case "mono-debt-link-upsert":
      await upsertMonoDebtLink(client, op.entry, userId, clientTs);
      return "applied";

    case "mono-debt-link-delete":
      await deleteMonoDebtLink(client, op.transactionId, userId);
      return "applied";

    case "networth-upsert":
      await upsertNetworth(client, op.entry, userId, clientTs);
      return "applied";

    case "prefs-upsert":
      await upsertPrefs(client, op.prefs, userId, clientTs);
      return "applied";

    default: {
      const _exhaustive: never = op;
      void _exhaustive;
      return "skipped";
    }
  }
}

// -----------------------------------------------------------------------
// Composite-PK tombstones (id-tables)
// -----------------------------------------------------------------------

const ID_COLUMN: Record<FinykIdTable, "account_id" | "transaction_id"> = {
  finyk_hidden_accounts: "account_id",
  finyk_hidden_transactions: "transaction_id",
};

async function upsertIdEntry(
  client: SqliteMigrationClient,
  table: FinykIdTable,
  entry: FinykIdEntry,
  userId: string,
  clientTs: string,
): Promise<void> {
  const col = ID_COLUMN[table];
  await client.run(
    `INSERT INTO ${table}
       (user_id, ${col}, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(user_id, ${col}) DO UPDATE SET
       updated_at = excluded.updated_at,
       deleted_at = NULL
     WHERE excluded.updated_at > ${table}.updated_at`,
    [userId, entry.id, clientTs, clientTs],
  );
}

async function softDeleteIdEntry(
  client: SqliteMigrationClient,
  table: FinykIdTable,
  id: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  const col = ID_COLUMN[table];
  await client.run(
    `UPDATE ${table}
        SET deleted_at = ?, updated_at = ?
      WHERE user_id = ? AND ${col} = ? AND updated_at < ?`,
    [clientTs, clientTs, userId, id, clientTs],
  );
}

// -----------------------------------------------------------------------
// Per-row + JSONB blobs
// -----------------------------------------------------------------------

async function upsertBlobEntry(
  client: SqliteMigrationClient,
  table: FinykBlobTable,
  entry: FinykBlobEntry,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO ${table}
       (id, user_id, data_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       data_json  = excluded.data_json,
       updated_at = excluded.updated_at,
       deleted_at = NULL
     WHERE excluded.updated_at > ${table}.updated_at`,
    [entry.id, userId, entry.dataJson ?? "{}", clientTs, clientTs],
  );
}

async function softDeleteBlobEntry(
  client: SqliteMigrationClient,
  table: FinykBlobTable,
  id: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `UPDATE ${table}
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    [clientTs, clientTs, id, userId, clientTs],
  );
}

// -----------------------------------------------------------------------
// Per-tx mappings (no soft-delete — absence is the "no override" state)
// -----------------------------------------------------------------------

async function upsertTxCategory(
  client: SqliteMigrationClient,
  entry: FinykTxCategoryEntry,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO finyk_tx_categories
       (user_id, transaction_id, category_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, transaction_id) DO UPDATE SET
       category_id = excluded.category_id,
       updated_at  = excluded.updated_at
     WHERE excluded.updated_at > finyk_tx_categories.updated_at`,
    [userId, entry.transactionId, entry.categoryId, clientTs, clientTs],
  );
}

async function deleteTxCategory(
  client: SqliteMigrationClient,
  transactionId: string,
  userId: string,
): Promise<void> {
  await client.run(
    `DELETE FROM finyk_tx_categories
      WHERE user_id = ? AND transaction_id = ?`,
    [userId, transactionId],
  );
}

async function upsertTxSplits(
  client: SqliteMigrationClient,
  entry: FinykTxSplitsEntry,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO finyk_tx_splits
       (user_id, transaction_id, splits_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, transaction_id) DO UPDATE SET
       splits_json = excluded.splits_json,
       updated_at  = excluded.updated_at
     WHERE excluded.updated_at > finyk_tx_splits.updated_at`,
    [userId, entry.transactionId, entry.splitsJson ?? "[]", clientTs, clientTs],
  );
}

async function deleteTxSplits(
  client: SqliteMigrationClient,
  transactionId: string,
  userId: string,
): Promise<void> {
  await client.run(
    `DELETE FROM finyk_tx_splits
      WHERE user_id = ? AND transaction_id = ?`,
    [userId, transactionId],
  );
}

async function upsertMonoDebtLink(
  client: SqliteMigrationClient,
  entry: FinykMonoDebtLinkEntry,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO finyk_mono_debt_links
       (user_id, transaction_id, debt_ids_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, transaction_id) DO UPDATE SET
       debt_ids_json = excluded.debt_ids_json,
       updated_at    = excluded.updated_at
     WHERE excluded.updated_at > finyk_mono_debt_links.updated_at`,
    [
      userId,
      entry.transactionId,
      entry.debtIdsJson ?? "[]",
      clientTs,
      clientTs,
    ],
  );
}

async function deleteMonoDebtLink(
  client: SqliteMigrationClient,
  transactionId: string,
  userId: string,
): Promise<void> {
  await client.run(
    `DELETE FROM finyk_mono_debt_links
      WHERE user_id = ? AND transaction_id = ?`,
    [userId, transactionId],
  );
}

// -----------------------------------------------------------------------
// Time-series: networth_history (composite PK (user_id, month))
// -----------------------------------------------------------------------

async function upsertNetworth(
  client: SqliteMigrationClient,
  entry: FinykNetworthEntry,
  userId: string,
  clientTs: string,
): Promise<void> {
  // Defensive: the apply-fn server-side validates the YYYY-MM format
  // with a regex; mirror that here so a corrupt LS row doesn't poison
  // the local table.
  if (!/^\d{4}-\d{2}$/.test(entry.month)) return;
  const networth = Number.isFinite(entry.networth) ? entry.networth : 0;
  await client.run(
    `INSERT INTO finyk_networth_history
       (user_id, month, networth, snapshot_json, created_at, updated_at)
     VALUES (?, ?, ?, '{}', ?, ?)
     ON CONFLICT(user_id, month) DO UPDATE SET
       networth   = excluded.networth,
       updated_at = excluded.updated_at
     WHERE excluded.updated_at > finyk_networth_history.updated_at`,
    [userId, entry.month, networth, clientTs, clientTs],
  );
}

// -----------------------------------------------------------------------
// Singleton prefs (per-user)
// -----------------------------------------------------------------------

async function upsertPrefs(
  client: SqliteMigrationClient,
  prefs: FinykPrefsSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO finyk_prefs
       (user_id, monthly_plan_json, show_balance, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       monthly_plan_json = excluded.monthly_plan_json,
       show_balance      = excluded.show_balance,
       updated_at        = excluded.updated_at
     WHERE excluded.updated_at > finyk_prefs.updated_at`,
    [
      userId,
      prefs.monthlyPlanJson ?? "{}",
      prefs.showBalance ? 1 : 0,
      clientTs,
      clientTs,
    ],
  );
}
