/**
 * Контекст користувача для RLS-політик (spec `rls-ai-tables-and-isolation-gate`,
 * A4-A5).
 *
 * Модуль навмисно НЕ імпортує `db.ts`: пул приходить параметром, тож helper
 * однаково працює з глобальним пулом, з пулом testcontainer-а і з `Pool`, який
 * handler отримав через DI. Привʼязані до глобального пулу обгортки з
 * підписом зі спеки (`withUserContext(userId, fn)`, `withBypassContext(fn)`)
 * живуть у `db.ts`.
 *
 * AI-DANGER: контекст ставиться ВИКЛЮЧНО через `set_config(name, value, true)`
 * (третій аргумент = `is_local`, еквівалент `SET LOCAL`) усередині явної
 * транзакції. Рантайм-пул ходить через pgBouncer у transaction-mode: зʼєднання
 * не закріплене за запитом, тож звичайний `SET` (без `LOCAL`) протік би на
 * чужий запит. Не прибирай BEGIN, навіть коли `fn` робить один SELECT.
 *
 * Поки політик RLS немає, helper не змінює поведінку: параметри `app.user_id`
 * і `app.bypass` ніхто не читає.
 */

import type { PoolClient } from "pg";

/** Мінімум, потрібний helper-у від пулу (`pg.Pool` задовольняє структурно). */
export interface ContextPool {
  connect(): Promise<PoolClient>;
}

/** Префікс `ai_usage_daily.subject_key` для рядків користувача. */
const USER_SUBJECT_PREFIX = "u:";

async function runInTransaction<T>(
  pool: ContextPool,
  setup: (client: PoolClient) => Promise<unknown>,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let rollbackFailed = false;
  try {
    await client.query("BEGIN");
    await setup(client);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
      // Зʼєднання лишилось усередині обірваної транзакції: `release(true)`
      // знищує його, щоб наступний викликач не отримав `current transaction
      // is aborted`. Оригінальна помилка однаково перемагає.
      rollbackFailed = true;
    });
    throw error;
  } finally {
    if (rollbackFailed) client.release(true);
    else client.release();
  }
}

/**
 * Виконує `fn` в транзакції з `app.user_id = userId`. `userId` іде
 * ПАРАМЕТРОМ (`SET LOCAL` плейсхолдерів не приймає, тому `set_config`).
 */
export async function runWithUserContext<T>(
  pool: ContextPool,
  userId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (typeof userId !== "string" || userId.trim() === "") {
    throw new Error("withUserContext: userId must be a non-empty string");
  }
  return runInTransaction(
    pool,
    (client) =>
      client.query("SELECT set_config('app.user_id', $1, true)", [userId]),
    fn,
  );
}

/**
 * Виконує `fn` в транзакції з `app.bypass = 'on'`: для фонових задач,
 * що обробляють рядки багатьох користувачів, і внутрішніх роутів.
 * Користувацьких даних сюди не передавай.
 */
export async function runWithBypassContext<T>(
  pool: ContextPool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return runInTransaction(
    pool,
    (client) => client.query("SELECT set_config('app.bypass', 'on', true)"),
    fn,
  );
}

/**
 * Контекст за `ai_usage_daily.subject_key`: `u:<userId>` -> користувацький
 * контекст, будь-що інше (`ip:<addr>`, глобальний агрегат провайдера,
 * `n8n:<source>`) не належить жодному користувачеві -> bypass.
 */
export async function runWithSubjectContext<T>(
  pool: ContextPool,
  subjectKey: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (
    subjectKey.startsWith(USER_SUBJECT_PREFIX) &&
    subjectKey.length > USER_SUBJECT_PREFIX.length
  ) {
    return runWithUserContext(
      pool,
      subjectKey.slice(USER_SUBJECT_PREFIX.length),
      fn,
    );
  }
  return runWithBypassContext(pool, fn);
}
