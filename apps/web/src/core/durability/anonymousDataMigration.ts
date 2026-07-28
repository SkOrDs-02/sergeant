/**
 * Last validated: 2026-07-28
 * Status: Active
 *
 * One-shot handoff of anonymous local-first rows to the first authenticated
 * profile. Source rows remain untouched until Sync V2 has acknowledged every
 * winning local row.
 */
import type { SyncV2PullOp } from "@sergeant/api-client";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { LOCAL_ANON_USER_ID } from "../auth/localIdentity.js";
import {
  applyPullOp,
  CLIENT_PULL_SUPPORTED_TABLES,
} from "../syncEngine/applyPullOp.js";
import { enqueueOutboxUpsert } from "../syncEngine/enqueueOutboxUpsert.js";

interface MigrationClaim extends Record<string, unknown> {
  readonly target_user_id: string;
  readonly batch_id: string;
  readonly status: "pending" | "completed";
}

interface SnapshotRow {
  readonly table: string;
  readonly row: Record<string, unknown>;
  readonly primaryKey: readonly string[];
  readonly clientTs: string;
}

export interface AnonymousMigrationResult {
  readonly migratedRows: number;
}

const MIGRATION_ORIGIN_DEVICE_ID = "anonymous-profile-migration";

async function migrateModuleSchemas(
  client: SqliteMigrationClient,
): Promise<void> {
  const [
    { migrateRoutine },
    { migrateFizruk },
    { migrateNutrition },
    { migrateFinyk },
  ] = await Promise.all([
    import("../../modules/routine/lib/clientMigrate.js"),
    import("../../modules/fizruk/lib/clientMigrate.js"),
    import("../../modules/nutrition/lib/clientMigrate.js"),
    import("../../modules/finyk/lib/clientMigrate.js"),
  ]);
  await migrateRoutine(client);
  await migrateFizruk(client);
  await migrateNutrition(client);
  await migrateFinyk(client);
}

async function tableExists(
  client: SqliteMigrationClient,
  table: string,
): Promise<boolean> {
  const rows = await client.all<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [table],
  );
  return rows.length > 0;
}

async function primaryKeyColumns(
  client: SqliteMigrationClient,
  table: string,
): Promise<string[]> {
  const rows = await client.all<{ name: string; pk: number }>(
    `SELECT name, pk FROM pragma_table_info(?)`,
    [table],
  );
  return rows
    .filter((row) => row.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((row) => row.name);
}

function resolveClientTs(row: Readonly<Record<string, unknown>>): string {
  for (const column of [
    "updated_at",
    "occurred_at",
    "last_completed_at",
    "created_at",
  ]) {
    const value = row[column];
    if (typeof value === "string" && Number.isFinite(Date.parse(value)))
      return value;
  }
  // A few legacy aggregate rows (notably routine_streaks) predate an
  // updated_at column. Epoch is deliberately conservative: an existing
  // server version wins, while a new profile can still accept the row.
  return "1970-01-01T00:00:00.000Z";
}

function decodeJsonColumns(
  row: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([column, value]) => {
      if (!column.endsWith("_json") || typeof value !== "string")
        return [column, value];
      try {
        return [column, JSON.parse(value) as unknown];
      } catch {
        return [column, value];
      }
    }),
  );
}

async function snapshotAnonymousRows(
  client: SqliteMigrationClient,
): Promise<SnapshotRow[]> {
  const snapshot: SnapshotRow[] = [];
  for (const table of CLIENT_PULL_SUPPORTED_TABLES) {
    if (!(await tableExists(client, table))) continue;
    const primaryKey = await primaryKeyColumns(client, table);
    if (primaryKey.length === 0)
      throw new Error("Anonymous table has no primary key");
    const rows = await client.all<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE user_id = ?`,
      [LOCAL_ANON_USER_ID],
    );
    for (const row of rows) {
      snapshot.push({ table, row, primaryKey, clientTs: resolveClientTs(row) });
    }
  }
  return snapshot;
}

async function getOrCreateClaim(
  client: SqliteMigrationClient,
  targetUserId: string,
): Promise<MigrationClaim> {
  const existing = await client.all<MigrationClaim>(
    `SELECT target_user_id, batch_id, status
       FROM anonymous_profile_migrations
      WHERE source_user_id = ?`,
    [LOCAL_ANON_USER_ID],
  );
  const claim = existing[0];
  if (claim) {
    if (claim.target_user_id !== targetUserId) {
      throw new Error("Anonymous data is already bound to another profile");
    }
    return claim;
  }
  const batchId = crypto.randomUUID();
  await client.run(
    `INSERT INTO anonymous_profile_migrations
       (source_user_id, target_user_id, batch_id, status, started_at)
     VALUES (?, ?, ?, 'pending', ?)`,
    [LOCAL_ANON_USER_ID, targetUserId, batchId, new Date().toISOString()],
  );
  return { target_user_id: targetUserId, batch_id: batchId, status: "pending" };
}

function canonicalPrimaryKey(item: SnapshotRow): string {
  return JSON.stringify(
    item.primaryKey.map((column) => [column, item.row[column]]),
  );
}

async function idempotencyKey(
  batchId: string,
  targetUserId: string,
  item: SnapshotRow,
): Promise<string> {
  const input = JSON.stringify([
    1,
    batchId,
    targetUserId,
    item.table,
    canonicalPrimaryKey(item),
    item.clientTs,
    item.row["deleted_at"] == null ? "insert" : "delete",
  ]);
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  const hex = Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `anonv1_${hex.slice(0, 48)}`;
}

async function assertServerAcknowledged(
  client: SqliteMigrationClient,
  keys: readonly string[],
): Promise<void> {
  if (keys.length === 0) return;
  const placeholders = keys.map(() => "?").join(", ");
  const rows = await client.all<{
    id: number;
    status: string;
    reject_reason: string | null;
  }>(
    `SELECT id, status, reject_reason
       FROM sync_op_outbox
      WHERE idempotency_key IN (${placeholders})`,
    [...keys],
  );
  const unresolved = rows.filter(
    (row) => row.status !== "rejected" || row.reject_reason !== "lww_conflict",
  );
  if (unresolved.length > 0)
    throw new Error("Anonymous migration is not server-confirmed");
  for (const row of rows) {
    await client.run(`DELETE FROM sync_op_outbox WHERE id = ?`, [row.id]);
  }
}

async function deleteSourceRows(
  client: SqliteMigrationClient,
  snapshot: readonly SnapshotRow[],
  batchId: string,
): Promise<void> {
  await client.run("BEGIN IMMEDIATE", []);
  try {
    for (const item of snapshot) {
      const where = item.primaryKey
        .map((column) => `${column} = ?`)
        .join(" AND ");
      await client.run(
        `DELETE FROM ${item.table} WHERE user_id = ? AND ${where}`,
        [
          LOCAL_ANON_USER_ID,
          ...item.primaryKey.map(
            (column) => item.row[column] as string | number,
          ),
        ],
      );
    }
    await client.run(
      `UPDATE anonymous_profile_migrations
          SET status = 'completed', completed_at = ?
        WHERE source_user_id = ? AND batch_id = ?`,
      [new Date().toISOString(), LOCAL_ANON_USER_ID, batchId],
    );
    await client.run("COMMIT", []);
  } catch (error) {
    await client.run("ROLLBACK", []);
    throw error;
  }
}

/** Run or resume the durable first-auth handoff. */
export async function migrateAnonymousDataToProfile(
  targetUserId: string,
): Promise<AnonymousMigrationResult> {
  if (!targetUserId) throw new Error("Target user id is required");
  const sqlite = await import("../db/sqlite.js");
  await sqlite.switchSqliteUser(null);
  const sourceClient = (await sqlite.getSqliteDb()).migrationClient();
  await migrateModuleSchemas(sourceClient);
  const snapshot = await snapshotAnonymousRows(sourceClient);
  if (snapshot.length === 0) {
    await sqlite.switchSqliteUser(targetUserId);
    return { migratedRows: 0 };
  }
  const claim = await getOrCreateClaim(sourceClient, targetUserId);

  await sqlite.switchSqliteUser(targetUserId);
  const targetClient = (await sqlite.getSqliteDb()).migrationClient();
  await migrateModuleSchemas(targetClient);

  const sync = await import("../syncEngine/singleton.js");
  const reader = await sync.bootSyncEngineReader();
  if (!reader) throw new Error("Sync reader is unavailable");
  await reader.pullOnce();

  const pushedKeys: string[] = [];
  for (const item of snapshot) {
    const row = { ...decodeJsonColumns(item.row), user_id: targetUserId };
    const op: SyncV2PullOp = {
      id: 0,
      table: item.table,
      op: item.row["deleted_at"] == null ? "insert" : "delete",
      row,
      client_ts: item.clientTs,
      server_ts: item.clientTs,
      origin_device_id: null,
    };
    const outcome = await applyPullOp(
      targetClient,
      op,
      targetUserId,
      MIGRATION_ORIGIN_DEVICE_ID,
    );
    if (outcome === "rejected")
      throw new Error("Anonymous row could not be applied");
    const key = await idempotencyKey(claim.batch_id, targetUserId, item);
    await enqueueOutboxUpsert(targetClient, {
      userId: targetUserId,
      table: item.table,
      op: op.op === "delete" ? "delete" : "insert",
      row,
      clientTs: item.clientTs,
      idempotencyKey: key,
    });
    pushedKeys.push(key);
  }

  const writer = await sync.bootSyncEngineWriter();
  if (!writer) throw new Error("Sync writer is unavailable");
  if (pushedKeys.length > 0) await writer.flushNow();
  await assertServerAcknowledged(targetClient, pushedKeys);
  await reader.pullOnce();

  await sqlite.switchSqliteUser(null);
  const cleanupClient = (await sqlite.getSqliteDb()).migrationClient();
  await deleteSourceRows(cleanupClient, snapshot, claim.batch_id);
  await sqlite.switchSqliteUser(targetUserId);
  return { migratedRows: snapshot.length };
}

/** Test-only seams for deterministic retry and acknowledgement invariants. */
export const __anonymousMigrationInternals = {
  assertServerAcknowledged,
  decodeJsonColumns,
  idempotencyKey,
  resolveClientTs,
};
