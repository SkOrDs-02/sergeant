/**
 * Кроки нотаток до операцій на буті читального шляху Фініка (`data-27`):
 *
 *  1. одноразове перелиття LS-нотаток у SQLite/outbox (`txNotesLsImport`);
 *  2. перепостановка нотаток, які старий сервер відхилив як
 *     `table_not_allowed` у вікні «фронт уже новий, бекенд ще старий»
 *     (`txNotesOutboxRecovery`).
 *
 * AI-DANGER: викликається СТРОГО ДО першого `refreshFinykSqliteState` (кеш,
 * опублікований без імпортованих нотаток, перекрив би слот порожнім обʼєктом).
 * Порядок кроків теж важливий: перелиття лише додає рядки, перепостановка
 * читає стан таблиці вже після нього.
 *
 * Кроки незалежні: збій одного логується й не заважає іншому та не валить буг
 * читального шляху (LS-ключ і відхилені рядки лишаються, наступний старт
 * повторить).
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { logger } from "@shared/lib";

import { importLegacyTxNotesFromLs } from "./txNotesLsImport.js";
import { requeueTxNotesRejectedByOldServer } from "./txNotesOutboxRecovery.js";

export async function runTxNotesBootSteps(
  client: SqliteMigrationClient,
  userId: string,
  clientTs: string,
): Promise<void> {
  try {
    await importLegacyTxNotesFromLs(client, userId, clientTs);
  } catch (err) {
    logger.warn(
      "[finyk.sqliteRead] tx-notes LS import failed",
      err instanceof Error ? err.message : err,
    );
  }
  try {
    await requeueTxNotesRejectedByOldServer(client, userId);
  } catch (err) {
    logger.warn(
      "[finyk.sqliteRead] tx-notes requeue failed",
      err instanceof Error ? err.message : err,
    );
  }
}
