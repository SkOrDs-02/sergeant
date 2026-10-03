import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { enqueueOutboxUpsert } from "./enqueueOutboxUpsert.js";

type SyncOpKind = "insert" | "update" | "delete";

/**
 * Fire-and-forget sync outbox enqueue (R2). Row keys should match local
 * SQLite column names so generic pull apply works without mappers.
 */
export function fireSyncOutboxUpsert(
  client: SqliteMigrationClient,
  args: {
    userId: string;
    table: string;
    op: SyncOpKind;
    row: Record<string, unknown>;
    clientTs: string;
  },
): void {
  void enqueueOutboxUpsert(client, {
    userId: args.userId,
    table: args.table,
    op: args.op,
    row: args.row,
    clientTs: args.clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {
    /* sync-enqueue failure is intentionally swallowed */
  });
}
