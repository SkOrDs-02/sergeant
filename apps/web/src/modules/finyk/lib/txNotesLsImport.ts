/**
 * Одноразове перелиття нотаток до операцій з localStorage у SQLite/outbox
 * (аудит 2026-10-01, data-27; рішення власника 2026-10-08).
 *
 * Чому воно потрібне. Перша частина виправлення (#1469) почала писати нотатки в
 * LS-ключ `finyk_tx_notes`. Тепер нотатки живуть у `finyk_tx_notes` (SQLite) і
 * їдуть у синк, а слот у `useFinykStorageSlots` після прогріву кешу
 * перекривається ЗНІМКОМ SQLite. Без перелиття всі нотатки, вписані між #1469 і
 * цією зміною, зникли б з екрана в момент першого overlay (у LS вони лежали б
 * мертвим вантажем).
 *
 * AI-DANGER: викликається лише з `bootFinykSqliteReadPath` і СТРОГО ДО першого
 * `refreshFinykSqliteState`: кеш, опублікований без імпортованих нотаток,
 * перекрив би слот порожнім обʼєктом.
 *
 * Ідемпотентність тримають дві речі:
 *
 *  1. Імпортуються лише транзакції, яких немає в SQLite-таблиці ВЗАГАЛІ (навіть
 *     як tombstone). Нотатка, видалена на іншому пристрої й уже підтягнута, не
 *     воскресає з давнього LS; нотатка, що вже переїхала, не пишеться вдруге.
 *  2. LS-ключ знімається лише після того, як УСІ записи пройшли без помилок.
 *     Збій лишає ключ на місці, і наступний буг пробує знову.
 *
 * Пише через той самий адаптер, що й решта дуалрайту (SQLite + outbox-оп), тож
 * сервер отримує звичайні `insert`-оп-и `finyk_tx_notes`.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { FINYK_FIELD_TO_STORAGE_KEY } from "@sergeant/finyk-domain/backup";

import { enqueueOutboxUpsert } from "../../../core/syncEngine/enqueueOutboxUpsert.js";
import { ensureOutboxSchema } from "../../../core/syncEngine/outboxSchema.js";
import { readJSON, removeItem } from "./finykStorage";
import { applyFinykDualWriteOps } from "./sqliteWriter/adapter.js";
import type { FinykDualWriteOp } from "./sqliteWriter/diff.js";
import { txNotesFromMap } from "./sqliteWriter/extract.js";

async function hasQueuedOp(
  client: SqliteMigrationClient,
  userId: string,
  transactionId: string,
): Promise<boolean> {
  await ensureOutboxSchema(client);
  const rows = await client.all<{ id: number }>(
    `SELECT id FROM sync_op_outbox
      WHERE user_id = ? AND table_name = 'finyk_tx_notes'
        AND json_extract(row, '$.transaction_id') = ?
      LIMIT 1`,
    [userId, transactionId],
  );
  return rows.length > 0;
}

export interface LegacyTxNotesImportResult {
  /** Скільки нотаток записано в SQLite/outbox цим викликом. */
  readonly imported: number;
  /** `true`, якщо LS-ключ знято (імпортувати більше нічого). */
  readonly drained: boolean;
}

const LS_KEY = FINYK_FIELD_TO_STORAGE_KEY.txNotes;

/**
 * Мітка LWW для перелитих нотаток: епоха, як `resolveClientTs` в
 * `anonymousDataMigration` для рядків без часу. Час запису нотатки в LS
 * невідомий, а «зараз» робило б давній LS-запис новішим за видалення чи
 * правку з іншого пристрою, зроблені ДО цього бута, і затирало б їх (outbox
 * програє сервер-LWW лише коли мітка менша). З епохою будь-який серверний
 * стан виграє: `lww_conflict` на такий insert - штатна benign-відмова (нотатку
 * вже перебито), а на порожньому сервері рядок приймається (нижньої межі
 * `client_ts` сервер не перевіряє, лише зсув уперед).
 */
export const LEGACY_LS_IMPORT_CLIENT_TS = "1970-01-01T00:00:00.000Z";

/**
 * @param clientTs ISO-мітка всього пакета (на бутi - `LEGACY_LS_IMPORT_CLIENT_TS`):
 *   однакова для рядків, бо рядків із тим самим ключем у пакеті немає.
 */
export async function importLegacyTxNotesFromLs(
  client: SqliteMigrationClient,
  userId: string,
  clientTs: string,
): Promise<LegacyTxNotesImportResult> {
  const legacy = readJSON<Record<string, unknown>>(LS_KEY, null);
  if (legacy === null || legacy === undefined) {
    return { imported: 0, drained: true };
  }

  const entries = txNotesFromMap(legacy);
  let imported = 0;
  if (entries.length > 0) {
    const known = await client.all<{
      transaction_id: string;
      note: string;
      updated_at: string;
      deleted_at: string | null;
    }>(
      `SELECT transaction_id, note, updated_at, deleted_at
         FROM finyk_tx_notes WHERE user_id = ?`,
      [userId],
    );
    const knownById = new Map(known.map((row) => [row.transaction_id, row]));
    const fresh = entries.filter(
      (entry) => !knownById.has(entry.transactionId),
    );
    const ops: FinykDualWriteOp[] = fresh.map((entry) => ({
      kind: "tx-note-upsert",
      entry,
    }));

    if (ops.length > 0) {
      const result = await applyFinykDualWriteOps(client, ops, {
        userId,
        clientTs,
      });
      imported = result.applied;
      // Часткова невдача: ключ лишаємо, повтор на наступному буті пропустить
      // уже записані рядки (вони тепер у таблиці) і допише решту.
      if (result.errored > 0 || result.skipped > 0) {
        return { imported, drained: false };
      }
    }

    // Адаптер пише SQLite першим і ковтає збій постановки в outbox, тож
    // «рядок є в таблиці» не доказ, що оп у черзі. Для нотаток, які пише САМЕ
    // це перелиття (живий рядок з нашою міткою й тим самим текстом), звіряємо
    // чергу і доставляємо відсутній оп сюди ж; збій лишає LS-ключ. Нотатки,
    // змінені/видалені відтоді (мітка інша), не чіпаємо.
    for (const entry of entries) {
      const existing = knownById.get(entry.transactionId);
      const ours =
        existing === undefined ||
        (existing.deleted_at === null &&
          existing.updated_at === clientTs &&
          existing.note === entry.note);
      if (!ours) continue;
      try {
        if (await hasQueuedOp(client, userId, entry.transactionId)) continue;
        await enqueueOutboxUpsert(client, {
          userId,
          table: "finyk_tx_notes",
          op: "insert",
          row: {
            user_id: userId,
            transaction_id: entry.transactionId,
            note: entry.note,
          },
          clientTs,
          idempotencyKey: crypto.randomUUID(),
        });
      } catch {
        return { imported, drained: false };
      }
    }
  }

  removeItem(LS_KEY);
  return { imported, drained: true };
}
