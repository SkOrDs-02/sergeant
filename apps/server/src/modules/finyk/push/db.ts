/**
 * Вузький контракт БД для push Фініка.
 *
 * Свідомо не `Pool`: вебхук Monobank і синк ходять через `query()` з
 * `db.ts` (ретраї й метрика `op` на кожен запит, спека § Ризики: «міряти
 * `op` у `query()`»), а прохід нагадувань і інтеграційні тести дають
 * `pg.Pool`. Обидва зводяться сюди адаптером нижче, і модулю push не треба
 * імпортувати `db.ts` (той читає env на імпорті).
 */

import type { Pool, QueryResultRow } from "pg";

export interface FinykPushDb {
  query<R extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[],
    op?: string,
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

/** Функція `query()` з `db.ts`: третій аргумент несе мітку `op`. */
export type MeteredQuery = <R extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[],
  meta?: { op?: string },
) => Promise<{ rows: R[]; rowCount: number | null }>;

/** Адаптер над `query()` з `db.ts`: кожен запит із міткою `op`. */
export function finykPushDbFromQuery(query: MeteredQuery): FinykPushDb {
  return {
    query: (sql, params, op) => query(sql, params, { op: op ?? "finyk_push" }),
  };
}

/**
 * Адаптер над `pg.Pool`. Мітку `op` відкидаємо: третій аргумент
 * `Pool.query` це колбек, а не метадані.
 */
export function finykPushDbFromPool(pool: Pool): FinykPushDb {
  return {
    query: async <R extends QueryResultRow>(sql: string, params: unknown[]) => {
      const res = await pool.query<R>(sql, params);
      return { rows: res.rows, rowCount: res.rowCount };
    },
  };
}
