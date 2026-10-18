import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../../http/schemas.js";
import {
  isWithinTextBound,
  NOTE_MAX_LEN,
  parseOptionalDate,
} from "../syncV2-core.js";
import type { AppliedStatus } from "../syncV2-types.js";
import { applyIfNewer } from "../applySync-helpers.js";

/**
 * `finyk_tx_notes` — нотатки користувача до банківських операцій
 * (аудит 2026-10-01, data-27; міграція 155).
 *
 * Форма — composite-PK tombstone `(user_id, transaction_id)` з корисним
 * навантаженням `note`. Усе за канонічним LWW (ADR-0004): рядок виграє, лише
 * якщо `updated_at` строго новіший, і саме в тому SQL, що пише (див.
 * `applyIfNewer`). Видалення — soft (`deleted_at`), тож новіший запис
 * воскрешає tombstone, як і в решти finyk-таблиць (`guardUuidPkApply`).
 *
 * Порожня нотатка на `insert`/`update` — це видалення: клієнт додає в op-лог
 * `delete`, але відхиляти порожній `note` термінальним `rejected` означало б
 * назавжди загубити видалення від клієнта з іншим контрактом, тож він
 * трактується як `delete`.
 *
 * Довжина — `NOTE_MAX_LEN` (як у решти вільного тексту синку); `transaction_id`
 * — `NAME_MAX_LEN` за замовчуванням `isWithinTextBound` (Mono-id ~20 символів).
 */
export async function applyFinykTxNotes(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const transactionId =
    typeof row["transaction_id"] === "string" ? row["transaction_id"] : null;
  if (!transactionId) return { status: "rejected", reason: "missing_tx_id" };
  if (!isWithinTextBound(transactionId)) {
    return { status: "rejected", reason: "text_too_long" };
  }

  if (row["user_id"] == null) {
    return { status: "rejected", reason: "missing_user_id" };
  }
  if (row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const rawNote = typeof row["note"] === "string" ? row["note"] : "";
  if (!isWithinTextBound(rawNote, NOTE_MAX_LEN)) {
    return { status: "rejected", reason: "text_too_long" };
  }
  const note = rawNote.trim();

  const existing = await client.query<{
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT updated_at, deleted_at FROM finyk_tx_notes
       WHERE user_id = $1 AND transaction_id = $2`,
    [userId, transactionId],
  );
  if (
    existing.rows.length > 0 &&
    existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()
  ) {
    return { status: "rejected", reason: "lww_conflict" };
  }

  if (op.op === "delete" || note === "") {
    if (existing.rows.length === 0) {
      // Явне видалення нічого не знайшло - це `not_found`, як у решти
      // tombstone-таблиць; порожній `note` на insert/update - не помилка.
      return op.op === "delete"
        ? { status: "rejected", reason: "not_found" }
        : { status: "applied" };
    }
    return applyIfNewer(
      client,
      `UPDATE finyk_tx_notes
         SET deleted_at = $1, updated_at = $1
       WHERE user_id = $2 AND transaction_id = $3 AND updated_at < $1`,
      [clientTs, userId, transactionId],
    );
  }

  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }

  return applyIfNewer(
    client,
    `INSERT INTO finyk_tx_notes
       (user_id, transaction_id, note, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, NULL)
     ON CONFLICT (user_id, transaction_id) DO UPDATE
       SET note       = EXCLUDED.note,
           updated_at = EXCLUDED.updated_at,
           deleted_at = NULL
       WHERE finyk_tx_notes.updated_at < EXCLUDED.updated_at`,
    [userId, transactionId, note, createdAt ?? clientTs, clientTs],
  );
}
