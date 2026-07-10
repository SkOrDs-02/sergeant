import {
  createApplyOps,
  type ApplyDualWriteOptions as CoreApplyDualWriteOptions,
  type ApplyDualWriteResult as CoreApplyDualWriteResult,
  type DualWriteLogger as CoreDualWriteLogger,
  type DualWriteRuntime,
} from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { logger as webLogger } from "@shared/lib";

import { enqueueOutboxUpsert } from "../../../../core/syncEngine/enqueueOutboxUpsert.js";

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
import {
  blobDeleteSql,
  blobUpsertSql,
  idDeleteSql,
  idUpsertSql,
  MONO_DEBT_LINK_DELETE_SQL,
  MONO_DEBT_LINK_UPSERT_SQL,
  NETWORTH_UPSERT_SQL,
  PREFS_UPSERT_SQL,
  TX_CATEGORY_DELETE_SQL,
  TX_CATEGORY_UPSERT_SQL,
  TX_SPLITS_DELETE_SQL,
  TX_SPLITS_UPSERT_SQL,
} from "./specs.js";

/**
 * Async SQLite-side adapter for the Finyk dual-write layer.
 *
 * Stage 4 PR #036 of `docs/planning/storage-roadmap.md`. Migrated onto
 * `@sergeant/dualwrite-core` in ADR-0073 крок 5: the op-loop is now
 * `createApplyOps` (best-effort) and every table's SQL is emitted by the
 * shared `buildLwwUpsert` / `buildDelete` builders via the TableSpecs in
 * `specs.ts` (split out to stay under Hard Rule #18). Behaviour and emitted
 * SQL are byte-identical to the previous hand-written adapter — pinned by
 * `adapter.snapshot.test.ts` (the snapshot must NOT be updated).
 *
 * Design notes:
 *
 * - Best-effort: every op is wrapped in try/catch. A single failed op does
 *   NOT abort the rest.
 * - Idempotent: upserts use ON CONFLICT(...) DO UPDATE with an LWW guard;
 *   updates apply only when the incoming `clientTs` is strictly newer than
 *   the local `updated_at`.
 * - Soft-delete on tables that have `deleted_at`; hard `DELETE` on the per-tx
 *   mappings (`finyk_tx_categories` / `finyk_tx_splits` /
 *   `finyk_mono_debt_links`) — no soft-delete column there, absence is the
 *   "no override" state, by design (ADR-0073 Open Q #2). The hard delete
 *   carries no LWW guard on purpose.
 */

export type ApplyDualWriteOptions = CoreApplyDualWriteOptions;
export type DualWriteLogger = CoreDualWriteLogger;
export type ApplyDualWriteResult = CoreApplyDualWriteResult;

const DEFAULT_LOGGER: DualWriteLogger = (level, message, meta) => {
  if (level === "warn") {
    webLogger.warn(`[finyk.dualWrite] ${message}`, meta ?? {});
  }
};

const applyOps = createApplyOps<FinykDualWriteOp>({
  errorPolicy: "best-effort",
  handlers: {
    "id-upsert": async (client, op, rt) => {
      await upsertIdEntry(client, op.table, op.entry, rt);
      return "applied";
    },
    "id-delete": async (client, op, rt) => {
      await softDeleteIdEntry(client, op.table, op.id, rt);
      return "applied";
    },
    "blob-upsert": async (client, op, rt) => {
      await upsertBlobEntry(client, op.table, op.entry, rt);
      return "applied";
    },
    "blob-delete": async (client, op, rt) => {
      await softDeleteBlobEntry(client, op.table, op.id, rt);
      return "applied";
    },
    "tx-category-upsert": async (client, op, rt) => {
      await upsertTxCategory(client, op.entry, rt);
      return "applied";
    },
    "tx-category-delete": async (client, op, rt) => {
      await deleteTxCategory(client, op.transactionId, rt);
      return "applied";
    },
    "tx-splits-upsert": async (client, op, rt) => {
      await upsertTxSplits(client, op.entry, rt);
      return "applied";
    },
    "tx-splits-delete": async (client, op, rt) => {
      await deleteTxSplits(client, op.transactionId, rt);
      return "applied";
    },
    "mono-debt-link-upsert": async (client, op, rt) => {
      await upsertMonoDebtLink(client, op.entry, rt);
      return "applied";
    },
    "mono-debt-link-delete": async (client, op, rt) => {
      await deleteMonoDebtLink(client, op.transactionId, rt);
      return "applied";
    },
    "networth-upsert": async (client, op, rt) => {
      await upsertNetworth(client, op.entry, rt);
      return "applied";
    },
    "prefs-upsert": async (client, op, rt) => {
      await upsertPrefs(client, op.prefs, rt);
      return "applied";
    },
  },
});

export async function applyFinykDualWriteOps(
  client: SqliteMigrationClient,
  ops: readonly FinykDualWriteOp[],
  options: ApplyDualWriteOptions,
): Promise<ApplyDualWriteResult> {
  return applyOps(client, ops, {
    userId: options.userId,
    clientTs: options.clientTs,
    logger: options.logger ?? DEFAULT_LOGGER,
  });
}

// -----------------------------------------------------------------------
// Composite-PK tombstones (id-tables)
// -----------------------------------------------------------------------

/** Maps each id-table to its external id column for the outbox row payload. */
const ID_TABLE_COL: Record<FinykIdTable, "account_id" | "transaction_id"> = {
  finyk_hidden_accounts: "account_id",
  finyk_hidden_transactions: "transaction_id",
};

async function upsertIdEntry(
  client: SqliteMigrationClient,
  table: FinykIdTable,
  entry: FinykIdEntry,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(idUpsertSql(table), [userId, entry.id, clientTs, clientTs]);
  void enqueueOutboxUpsert(client, {
    userId,
    table,
    op: "insert",
    row: { user_id: userId, [ID_TABLE_COL[table]]: entry.id },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {
    /* sync-enqueue failure is intentionally swallowed */
  });
}

async function softDeleteIdEntry(
  client: SqliteMigrationClient,
  table: FinykIdTable,
  id: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(idDeleteSql(table), [
    clientTs,
    clientTs,
    userId,
    id,
    clientTs,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table,
    op: "delete",
    row: { user_id: userId, [ID_TABLE_COL[table]]: id },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {
    /* sync-enqueue failure is intentionally swallowed */
  });
}

// -----------------------------------------------------------------------
// Per-row + JSONB blobs
// -----------------------------------------------------------------------

async function upsertBlobEntry(
  client: SqliteMigrationClient,
  table: FinykBlobTable,
  entry: FinykBlobEntry,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(blobUpsertSql(table), [
    entry.id,
    userId,
    entry.dataJson ?? "{}",
    clientTs,
    clientTs,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table,
    op: "insert",
    row: { id: entry.id, user_id: userId, data_json: entry.dataJson ?? "{}" },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {
    /* sync-enqueue failure is intentionally swallowed */
  });
}

async function softDeleteBlobEntry(
  client: SqliteMigrationClient,
  table: FinykBlobTable,
  id: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(blobDeleteSql(table), [
    clientTs,
    clientTs,
    id,
    userId,
    clientTs,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table,
    op: "delete",
    row: { id, user_id: userId },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {
    /* sync-enqueue failure is intentionally swallowed */
  });
}

// -----------------------------------------------------------------------
// Per-tx mappings (hard DELETE — absence is the "no override" state)
// -----------------------------------------------------------------------

async function upsertTxCategory(
  client: SqliteMigrationClient,
  entry: FinykTxCategoryEntry,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(TX_CATEGORY_UPSERT_SQL, [
    userId,
    entry.transactionId,
    entry.categoryId,
    clientTs,
    clientTs,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "finyk_tx_categories",
    op: "insert",
    row: {
      user_id: userId,
      transaction_id: entry.transactionId,
      category_id: entry.categoryId,
    },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {
    /* sync-enqueue failure is intentionally swallowed */
  });
}

async function deleteTxCategory(
  client: SqliteMigrationClient,
  transactionId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(TX_CATEGORY_DELETE_SQL, [userId, transactionId]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "finyk_tx_categories",
    op: "delete",
    row: { user_id: userId, transaction_id: transactionId },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {
    /* sync-enqueue failure is intentionally swallowed */
  });
}

async function upsertTxSplits(
  client: SqliteMigrationClient,
  entry: FinykTxSplitsEntry,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(TX_SPLITS_UPSERT_SQL, [
    userId,
    entry.transactionId,
    entry.splitsJson ?? "[]",
    clientTs,
    clientTs,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "finyk_tx_splits",
    op: "insert",
    row: {
      user_id: userId,
      transaction_id: entry.transactionId,
      splits_json: entry.splitsJson ?? "[]",
    },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {
    /* sync-enqueue failure is intentionally swallowed */
  });
}

async function deleteTxSplits(
  client: SqliteMigrationClient,
  transactionId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(TX_SPLITS_DELETE_SQL, [userId, transactionId]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "finyk_tx_splits",
    op: "delete",
    row: { user_id: userId, transaction_id: transactionId },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {
    /* sync-enqueue failure is intentionally swallowed */
  });
}

// R7: finyk_mono_debt_links is local-only — intentionally NOT enqueued.
async function upsertMonoDebtLink(
  client: SqliteMigrationClient,
  entry: FinykMonoDebtLinkEntry,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(MONO_DEBT_LINK_UPSERT_SQL, [
    userId,
    entry.transactionId,
    entry.debtIdsJson ?? "[]",
    clientTs,
    clientTs,
  ]);
}

async function deleteMonoDebtLink(
  client: SqliteMigrationClient,
  transactionId: string,
  { userId }: DualWriteRuntime,
): Promise<void> {
  await client.run(MONO_DEBT_LINK_DELETE_SQL, [userId, transactionId]);
}

// -----------------------------------------------------------------------
// Time-series: networth_history (composite PK (user_id, month))
// -----------------------------------------------------------------------

async function upsertNetworth(
  client: SqliteMigrationClient,
  entry: FinykNetworthEntry,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  // Defensive: the apply-fn server-side validates the YYYY-MM format
  // with a regex; mirror that here so a corrupt LS row doesn't poison
  // the local table.
  if (!/^\d{4}-\d{2}$/.test(entry.month)) return;
  const networth = Number.isFinite(entry.networth) ? entry.networth : 0;
  await client.run(NETWORTH_UPSERT_SQL, [
    userId,
    entry.month,
    networth,
    clientTs,
    clientTs,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "finyk_networth_history",
    op: "insert",
    row: { user_id: userId, month: entry.month, networth },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {
    /* sync-enqueue failure is intentionally swallowed */
  });
}

// -----------------------------------------------------------------------
// Singleton prefs (per-user)
// -----------------------------------------------------------------------

async function upsertPrefs(
  client: SqliteMigrationClient,
  prefs: FinykPrefsSnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(PREFS_UPSERT_SQL, [
    userId,
    prefs.monthlyPlanJson ?? "{}",
    prefs.showBalance ? 1 : 0,
    prefs.excludedStatTxIdsJson ?? "[]",
    prefs.dismissedRecurringJson ?? "[]",
    clientTs,
    clientTs,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "finyk_prefs",
    op: "insert",
    row: {
      user_id: userId,
      monthly_plan_json: prefs.monthlyPlanJson ?? "{}",
      show_balance: prefs.showBalance ? 1 : 0,
      excluded_stat_tx_ids_json: prefs.excludedStatTxIdsJson ?? "[]",
      dismissed_recurring_json: prefs.dismissedRecurringJson ?? "[]",
    },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {
    /* sync-enqueue failure is intentionally swallowed */
  });
}
