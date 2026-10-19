import type { SyncV2PullOp } from "@sergeant/api-client";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

// Type-only import: рантайм-циклу з `applyPullOp.ts` немає.
import type { ApplyPullOutcome } from "./applyPullOp.js";

/**
 * Pull-шлях ВИДАЛЕННЯ нотатки до операції (`finyk_tx_notes`, data-27).
 *
 * Генеричний шлях тут недостатній у двох місцях:
 *
 *  1. Приватність. Він ставить лише `deleted_at`, тож текст нотатки лишався
 *     б у tombstone-рядку. Тут `note = ''`.
 *  2. Видалення рядка, якого локально ще нема, генерично дає `skipped` без
 *     сліду. Для нотаток це дірка: перелиття LS (`txNotesLsImport`)
 *     імпортує лише транзакції, яких у таблиці немає ВЗАГАЛІ, тож видалення
 *     з іншого пристрою, що прийшло раніше за перелиття, не мало tombstone і
 *     старий LS-запис воскресав. Тому для відсутнього рядка вставляємо
 *     tombstone з міткою видалення.
 *
 * Порожня нотатка на не-delete оп-і (клієнт з іншим контрактом) трактується
 * як видалення, дзеркально до серверного `applyFinykTxNotes`.
 *
 * Повертає `null`, коли оп не видалення: далі працює генеричний upsert.
 */
export async function applyTxNotesPullDelete(
  client: SqliteMigrationClient,
  op: SyncV2PullOp,
  userId: string,
): Promise<ApplyPullOutcome | null> {
  const row = op.row;
  const rawNote = typeof row["note"] === "string" ? row["note"] : "";
  const isDelete = op.op === "delete" || rawNote.trim() === "";
  if (!isDelete) return null;

  const transactionId = row["transaction_id"];
  if (row["user_id"] !== userId) return "rejected";
  if (typeof transactionId !== "string" || transactionId === "") {
    return "rejected";
  }

  const changed = await client.all(
    `UPDATE finyk_tx_notes
        SET note = '', deleted_at = ?, updated_at = ?
      WHERE user_id = ? AND transaction_id = ?
        AND (julianday(updated_at) IS NULL OR julianday(updated_at) < julianday(?))
    RETURNING 1 AS applied`,
    [op.client_ts, op.client_ts, userId, transactionId, op.client_ts],
  );
  if (changed.length > 0) return "applied";

  const inserted = await client.all(
    `INSERT INTO finyk_tx_notes
       (user_id, transaction_id, note, created_at, updated_at, deleted_at)
     VALUES (?, ?, '', ?, ?, ?)
     ON CONFLICT(user_id, transaction_id) DO NOTHING
     RETURNING 1 AS applied`,
    [userId, transactionId, op.client_ts, op.client_ts, op.client_ts],
  );
  return inserted.length > 0 ? "applied" : "skipped";
}
