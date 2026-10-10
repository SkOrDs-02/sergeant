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

import { readJSON, removeItem } from "./finykStorage";
import { applyFinykDualWriteOps } from "./sqliteWriter/adapter.js";
import type { FinykDualWriteOp } from "./sqliteWriter/diff.js";
import { txNotesFromMap } from "./sqliteWriter/extract.js";

export interface LegacyTxNotesImportResult {
  /** Скільки нотаток записано в SQLite/outbox цим викликом. */
  readonly imported: number;
  /** `true`, якщо LS-ключ знято (імпортувати більше нічого). */
  readonly drained: boolean;
}

const LS_KEY = FINYK_FIELD_TO_STORAGE_KEY.txNotes;

/**
 * @param clientTs ISO-мітка всього пакета: однакова для рядків, бо рядків із
 *   тим самим ключем у пакеті немає, а проти наявних LWW не змагається (їх
 *   пропущено).
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
    const known = await client.all<{ transaction_id: string }>(
      `SELECT transaction_id FROM finyk_tx_notes WHERE user_id = ?`,
      [userId],
    );
    const knownIds = new Set(known.map((row) => row.transaction_id));
    const ops: FinykDualWriteOp[] = entries
      .filter((entry) => !knownIds.has(entry.transactionId))
      .map((entry) => ({ kind: "tx-note-upsert", entry }));

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
  }

  removeItem(LS_KEY);
  return { imported, drained: true };
}
