/**
 * Повторна відправка нотаток, які старий сервер відхилив як
 * `table_not_allowed` (аудит 2026-10-01, `data-27`).
 *
 * Чому це потрібно. Фронт викочується Vercel-ом одразу після мержу, а бекенд
 * (`deploy-api`) чекає зеленого CI ~25 хв (AGENTS.md § Deployment). У цьому
 * вікні новий клієнт пушить `finyk_tx_notes`, а старий сервер не має таблиці в
 * `OP_LOG_TABLE_REGISTRY` і відповідає `rejected / table_not_allowed`. Для
 * outbox це ТЕРМІНАЛЬНА відмова: рядок отримує `status='rejected'`, ніколи не
 * ретраїться, а повтор того самого `idempotency_key` сервер віддав би як
 * `duplicate` зі старим відхиленням (відхилений оп теж лежить у `sync_op_log`).
 * Одноразове перелиття LS-нотаток при цьому вже зняло LS-ключ, тож нотатки
 * лишилися б лише в SQLite цього пристрою й не доїхали б на інші ніколи.
 *
 * Що робимо. На кожному буті читального шляху шукаємо відхилені
 * `table_not_allowed` оп-и `finyk_tx_notes` цього користувача, для кожної
 * затронутої операції кладемо в чергу СВІЖИЙ оп (новий `idempotency_key`) із
 * ПОТОЧНОГО стану локального рядка і з його власним `updated_at` як
 * `client_ts` (LWW лишається чесним: ми не «оновлюємо» нотатку заднім числом
 * ні вперед), після чого прибираємо старий відхилений рядок. Якщо сервер усе ще
 * старий, новий оп знову буде відхилено, а наступний бут повторить спробу;
 * відхилені рядки не накопичуються, бо старі прибираються.
 *
 * Працює лише з `table_not_allowed`: інші причини (`text_too_long`,
 * `invalid_text_encoding`, …) — справжні відмови, повтор їх не виправить.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { enqueueOutboxUpsert } from "../../../core/syncEngine/enqueueOutboxUpsert.js";
import { ensureOutboxSchema } from "../../../core/syncEngine/outboxSchema.js";

const TABLE = "finyk_tx_notes";
const REASON = "table_not_allowed";

export interface TxNotesRecoveryResult {
  /** Скільки відхилених оп-ів замінено свіжими в черзі. */
  readonly requeued: number;
  /** Скільки відхилених рядків лишилось (збій черги / не наш користувач). */
  readonly remaining: number;
}

interface RejectedRow extends Record<string, unknown> {
  readonly id: number;
  readonly row: string;
}

interface NoteRow extends Record<string, unknown> {
  readonly note: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
}

function transactionIdOf(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return null;
    const id = (parsed as Record<string, unknown>)["transaction_id"];
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/** `updated_at` у SQLite — наш ISO або `datetime('now')`; у чергу їде ISO. */
function toIso(value: string): string {
  for (const candidate of [value, `${value.replace(" ", "T")}Z`]) {
    const ms = Date.parse(candidate);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  // eslint-disable-next-line no-restricted-syntax -- LWW clientTs wall-clock, not a Kyiv day key
  return new Date().toISOString();
}

export async function requeueTxNotesRejectedByOldServer(
  client: SqliteMigrationClient,
  userId: string,
): Promise<TxNotesRecoveryResult> {
  await ensureOutboxSchema(client);

  const rejected = await client.all<RejectedRow>(
    `SELECT id, row FROM sync_op_outbox
      WHERE user_id = ? AND table_name = ?
        AND status = 'rejected' AND reject_reason = ?
      ORDER BY id`,
    [userId, TABLE, REASON],
  );
  if (rejected.length === 0) return { requeued: 0, remaining: 0 };

  const idsByTx = new Map<string, number[]>();
  let remaining = 0;
  for (const entry of rejected) {
    const tx = transactionIdOf(entry.row);
    if (tx === null) {
      // Без ключа операції відновлювати нічого; рядок лишаємо як є.
      remaining++;
      continue;
    }
    const bucket = idsByTx.get(tx);
    if (bucket) bucket.push(entry.id);
    else idsByTx.set(tx, [entry.id]);
  }

  let requeued = 0;
  for (const [transactionId, outboxIds] of idsByTx) {
    try {
      const local = await client.all<NoteRow>(
        `SELECT note, updated_at, deleted_at FROM ${TABLE}
          WHERE user_id = ? AND transaction_id = ?`,
        [userId, transactionId],
      );
      const current = local[0];
      if (current !== undefined) {
        const queued = await enqueueOutboxUpsert(client, {
          userId,
          table: TABLE,
          ...(current.deleted_at === null
            ? {
                op: "insert" as const,
                row: {
                  user_id: userId,
                  transaction_id: transactionId,
                  note: current.note,
                },
              }
            : {
                op: "delete" as const,
                row: { user_id: userId, transaction_id: transactionId },
              }),
          clientTs: toIso(current.updated_at),
          idempotencyKey: crypto.randomUUID(),
        });
        if (queued.skipped !== null) {
          remaining += outboxIds.length;
          continue;
        }
      }
      // Локального рядка вже немає (нема що слати) або свіжий оп у черзі:
      // відхилений запис більше не потрібен.
      const placeholders = outboxIds.map(() => "?").join(", ");
      await client.run(
        `DELETE FROM sync_op_outbox
          WHERE status = 'rejected' AND id IN (${placeholders})`,
        outboxIds,
      );
      if (current !== undefined) requeued += outboxIds.length;
    } catch {
      remaining += outboxIds.length;
    }
  }
  return { requeued, remaining };
}
