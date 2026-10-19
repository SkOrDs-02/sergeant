/**
 * Кроки нотаток до операцій на буті читального шляху Фініка (`data-27`).
 * Їх два, і вони стоять по різні боки першого `refreshFinykSqliteState`:
 *
 *  1. `runTxNotesImportStep` - одноразове перелиття LS-нотаток у
 *     SQLite/outbox (`txNotesLsImport`). СТРОГО ДО першого refresh: кеш,
 *     опублікований без імпортованих нотаток, перекрив би слот порожнім
 *     обʼєктом.
 *  2. `runTxNotesRequeueStep` - перепостановка нотаток, які старий сервер
 *     відхилив як `table_not_allowed` у вікні «фронт уже новий, бекенд ще
 *     старий» (`txNotesOutboxRecovery`). ПІСЛЯ першого refresh і без
 *     очікування: крок читає стан таблиці вже після перелиття, але сам
 *     таблицю нотаток не змінює (лише ставить оп-и в outbox).
 *
 * AI-DANGER: не став крок 2 перед refresh і не чекай його в `await` бута. Він
 * запускає DDL outbox і кілька запитів, тобто відсуває публікацію кешу та
 * `notifyFinykSqliteCacheRefresh` для КОЖНОГО старту. Публікація змагається з
 * відповідями мережі Фініка (sync-state / transactions) за порядок рендерів, і
 * при зсуві спостерігач без запиту банку (екран) вмикається вже після того, як
 * перший запит відпрацював, а це другий запит операцій банку. Так падав
 * `FinykBootCluster.freshness.test.tsx` (запит банку один).
 *
 * Кроки незалежні: збій одного логується й не заважає іншому та не валить буг
 * читального шляху (LS-ключ і відхилені рядки лишаються, наступний старт
 * повторить).
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { logger } from "@shared/lib";

import { importLegacyTxNotesFromLs } from "./txNotesLsImport.js";
import { requeueTxNotesRejectedByOldServer } from "./txNotesOutboxRecovery.js";

export async function runTxNotesImportStep(
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
}

export async function runTxNotesRequeueStep(
  client: SqliteMigrationClient,
  userId: string,
): Promise<void> {
  try {
    await requeueTxNotesRejectedByOldServer(client, userId);
  } catch (err) {
    logger.warn(
      "[finyk.sqliteRead] tx-notes requeue failed",
      err instanceof Error ? err.message : err,
    );
  }
}
