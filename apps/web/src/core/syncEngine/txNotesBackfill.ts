import type { SyncV2PullResponse } from "@sergeant/api-client";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { applyPullOp } from "./applyPullOp.js";
import { readCursorValue, writeCursorValue } from "./syncOpCursor.js";

const TABLE = "finyk_tx_notes";

/**
 * Скільки сторінок журналу догін проходить за один тік. Довга історія не має
 * затримувати основний pull: решту дотягнуть наступні тіки з `progressKey`.
 */
export const BACKFILL_PAGES_PER_TICK = 5;

const doneKey = (userId: string): string =>
  `backfill_done:${TABLE}:v1:${userId}`;
const progressKey = (userId: string): string =>
  `backfill_progress:${TABLE}:v1:${userId}`;

export interface TxNotesBackfillDeps {
  readonly client: SqliteMigrationClient;
  readonly userId: string;
  readonly originDeviceId: string;
  /** Звичайний курсор pull-у на початку тіка: 0 = повний pull і так попереду. */
  readonly mainCursor: number;
  /** Сторінка pull-у з повтором на рейт-ліміт (як у основному циклі). */
  readonly fetchPage: (since: number) => Promise<SyncV2PullResponse>;
  /** Таблиці, кеші яких треба освіжити після тіка. */
  readonly affectedTables: Set<string>;
  readonly isConstraintFailure: (error: unknown) => boolean;
}

/** Позначає догін виконаним (виклик після успішного повного pull з курсора 0). */
export async function markTxNotesBackfillDone(
  client: SqliteMigrationClient,
  userId: string,
): Promise<void> {
  await writeCursorValue(client, doneKey(userId), 1);
}

/**
 * Одноразовий догін `finyk_tx_notes` для пристроїв, що оновились зі старого
 * бандла (data-27, ревʼю PR #1530).
 *
 * AI-CONTEXT: старий бандл не мав `finyk_tx_notes` у
 * `CLIENT_PULL_SUPPORTED_TABLES`: `applyPullOp` відхиляв такі оп-и, а курсор
 * `pull_since` усе одно їхав далі. Після перезавантаження на новий бандл ці
 * оп-и вже ніколи не тягнуться, і нотатки з інших пристроїв губляться
 * назавжди. Курсор НЕ перемотуємо на 0: інші таблиці мають `increment`-оп-и
 * (`routine_streaks`), які не ідемпотентні. Натомість один раз проходимо
 * журнал від 0 наявним `GET /api/v2/sync/pull` (нового контракту не треба) і
 * застосовуємо ЛИШЕ оп-и `finyk_tx_notes` через `applyPullOp` (LWW за
 * `updated_at`: новіші локальні правки не затираються). Прогрес пишеться
 * після кожної сторінки (рейт-ліміт чи обрив не починають з нуля), за тік
 * не більше `BACKFILL_PAGES_PER_TICK` сторінок, прапор «зроблено» - після
 * кінця журналу. Свіжа інсталяція (курсор 0) прапор ставить
 * одразу: основний цикл і так пройде весь журнал.
 *
 * Власні оп-и цього пристрою сервер не віддає (`originDeviceId`) - вони вже
 * локально.
 */
export async function backfillTxNotesOnce(
  deps: TxNotesBackfillDeps,
): Promise<void> {
  const { client, userId } = deps;
  if ((await readCursorValue(client, doneKey(userId))) === 1) return;
  // Свіжа інсталяція: основний цикл пройде весь журнал сам. Прапор ставить
  // `markTxNotesBackfillDone` після його успіху (не тут: збій основного pull
  // не має лишати нас без догону).
  if (deps.mainCursor === 0) return;

  let since = await readCursorValue(client, progressKey(userId));
  for (let pages = 0; ; pages += 1) {
    if (pages >= BACKFILL_PAGES_PER_TICK) {
      // Бюджет тіка вичерпано: прогрес уже збережено, продовжимо наступного разу.
      await writeCursorValue(client, progressKey(userId), since);
      return;
    }
    const page = await deps.fetchPage(since);
    let maxId = since;
    for (const op of page.ops) {
      maxId = Math.max(maxId, op.id);
      if (op.table !== TABLE) continue;
      try {
        const outcome = await applyPullOp(
          client,
          op,
          userId,
          deps.originDeviceId,
        );
        if (outcome === "applied") deps.affectedTables.add(TABLE);
      } catch (error) {
        // Отруйний оп не має заклинювати догін (як rel-11 в основному циклі);
        // BUSY/IOERR і подібне - ретрай, тож пробрасуємо.
        if (!deps.isConstraintFailure(error)) throw error;
      }
    }
    if (page.ops.length > 0) {
      await writeCursorValue(client, progressKey(userId), maxId);
    }
    if (page.next_cursor === null) break;
    since = page.next_cursor;
  }
  await writeCursorValue(client, doneKey(userId), 1);
}
