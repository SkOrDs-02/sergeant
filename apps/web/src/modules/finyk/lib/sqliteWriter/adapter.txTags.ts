import type { DualWriteRuntime } from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { enqueueOutboxUpsert } from "../../../../core/syncEngine/enqueueOutboxUpsert.js";

import type { FinykTxTagsEntry } from "./diff.js";
import { TX_TAGS_DELETE_SQL, TX_TAGS_UPSERT_SQL } from "./specs.js";

// Теги операцій (`finyk_tx_tags`, міграція 158): та сама форма, що
// `finyk_tx_splits` (JSON-масив, soft-delete). Сервер приймає таблицю через
// `applyFinykTxTags`. Окремий файл, щоб `adapter.ts` лишався під 600 рядків.

export async function upsertTxTags(
  client: SqliteMigrationClient,
  entry: FinykTxTagsEntry,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(TX_TAGS_UPSERT_SQL, [
    userId,
    entry.transactionId,
    entry.tagsJson,
    clientTs,
    clientTs,
  ]);
  await enqueueOutboxUpsert(client, {
    userId,
    table: "finyk_tx_tags",
    op: "insert",
    row: {
      user_id: userId,
      transaction_id: entry.transactionId,
      tags_json: entry.tagsJson,
    },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {
    /* sync-enqueue failure is intentionally swallowed */
  });
}

export async function deleteTxTags(
  client: SqliteMigrationClient,
  transactionId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(TX_TAGS_DELETE_SQL, [
    clientTs,
    clientTs,
    userId,
    transactionId,
    clientTs,
  ]);
  await enqueueOutboxUpsert(client, {
    userId,
    table: "finyk_tx_tags",
    op: "delete",
    row: { user_id: userId, transaction_id: transactionId },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {
    /* sync-enqueue failure is intentionally swallowed */
  });
}
