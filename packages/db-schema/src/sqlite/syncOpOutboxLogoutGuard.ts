import type { SqliteMigrationClient } from "../migrate/adapters/sqlite.js";

/**
 * Хелпери запобіжника «не стирати незасинхронізоване при виході»
 * (аудит 2026-10-01, `data-19`).
 *
 * Вихід з акаунта на вебі видаляє файл локальної БД разом із
 * `sync_op_outbox`. Поки запис не доїхав до Postgres, локальна копія — єдина,
 * тож «що ще не доїхало» мусить рахуватись ПОВНІСТЮ і ТІЛЬКИ для поточного
 * користувача:
 *
 * - `pending` — ще не відправлено (в тому числі в бекофі, `next_retry_at`
 *   у майбутньому);
 * - `dead_letter` — сервер так і не прийняв після всіх спроб, але рядок
 *   відновлюваний (`recoverDeadLetter`), тобто це живі дані людини;
 * - `rejected`, крім `excludeRejectReasons` (напр. `lww_conflict` — штатний
 *   результат last-write-wins, не втрата). Список причин той самий, що в
 *   лічильнику `rejected` на екрані стану синку: інакше людина бачила б
 *   на виході одну цифру, а в пілюлі — іншу;
 * - `quarantined` НЕ рахується: нерозбірливий payload, його ніхто не
 *   відновить, і питати про нього на виході нема про що.
 *
 * `user_id = ?` стоїть обов'язково: на kvvfs-фолбеку партиції всіх локальних
 * акаунтів ділять один фізичний стор, а `countOutboxByStatus` рахує його
 * цілком.
 */

export interface CountUnsyncedOutboxOptions {
  /** Сирий id користувача, що виходить (Better Auth opaque string). */
  readonly userId: string;
  /** Причини `rejected`, які НЕ є втратою даних. */
  readonly excludeRejectReasons?: readonly string[];
}

function assertUserId(fn: string, userId: unknown): asserts userId is string {
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error(`${fn}: a non-empty userId is required`);
  }
}

/**
 * Скільки рядків черги зникне разом із файлом БД: `pending` + `dead_letter`
 * + не-benign `rejected` цього користувача. Див. модульний коментар.
 */
export async function countUnsyncedOutboxForUser(
  client: SqliteMigrationClient,
  options: CountUnsyncedOutboxOptions,
): Promise<number> {
  assertUserId("countUnsyncedOutboxForUser", options.userId);
  const excluded = options.excludeRejectReasons ?? [];
  const excludeClause =
    excluded.length > 0
      ? ` AND (reject_reason IS NULL OR reject_reason NOT IN (${excluded.map(() => "?").join(", ")}))`
      : "";
  const rows = await client.all<{ count: number | bigint }>(
    `SELECT COUNT(*) AS count
       FROM sync_op_outbox
      WHERE user_id = ?
        AND (
          status IN ('pending', 'dead_letter')
          OR (status = 'rejected'${excludeClause})
        )`,
    [options.userId, ...excluded],
  );
  // Hard Rule #1: bigint → number через `Number()` + перевірка.
  const count = Number(rows[0]?.count ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(
      `countUnsyncedOutboxForUser: non-integer count ${JSON.stringify(String(rows[0]?.count))}`,
    );
  }
  return count;
}

/**
 * Скидає бекоф у `pending`-рядків користувача (`next_retry_at = NULL`), щоб
 * наступний `drainSyncOpOutbox` вважав їх «due» негайно. `attempts` і
 * `last_error` не чіпає: це не відновлення, а «спробуй зараз, поки не стерли».
 * Рядки інших користувачів і термінальні статуси не змінюються.
 */
export async function resetOutboxBackoffForUser(
  client: SqliteMigrationClient,
  userId: string,
): Promise<void> {
  assertUserId("resetOutboxBackoffForUser", userId);
  await client.run(
    `UPDATE sync_op_outbox
        SET next_retry_at = NULL
      WHERE status = 'pending'
        AND next_retry_at IS NOT NULL
        AND user_id = ?`,
    [userId],
  );
}
