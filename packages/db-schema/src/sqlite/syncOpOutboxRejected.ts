import type { SqliteMigrationClient } from "../migrate/adapters/sqlite.js";

/**
 * Read-only список термінально відхилених рядків `sync_op_outbox`.
 *
 * Пара до {@link countOutboxByStatus}: лічильник каже «скільки», цей хелпер —
 * «що саме». Потреба виникла з tech-debt знахідки 2026-08-25: push-оп, який
 * сервер відхилив (`user_id_mismatch`, `invalid_*`, `clock_skew`…), у клієнта
 * термінальний і не ретраїться, але жоден екран `apps/web` його не показував.
 * Запис виглядав збереженим, бо локально він і справді є, — тобто мовчазна
 * втрата історії. Лічильник `rejected` існував, а тіла до нього не було.
 *
 * Контракт вибірки:
 *
 * - Лише `status = 'rejected'`. `dead_letter` має свій шлях (ручний retry),
 *   `quarantined` — свій (repair), змішувати їх у один список означало б
 *   показати людині три різні дії під одним заголовком.
 * - Найновіші першими (`ORDER BY id DESC`), бо `id` автоінкрементний і
 *   монотонний у межах пристрою; `created_at` — текст `datetime('now')`
 *   без часового поясу, сортувати по нім небезпечно.
 * - `excludeReasons` фільтрує в SQL, а не після вибірки, щоб `limit`
 *   рахувався по видимих рядках: інакше 50 `lww_conflict` витиснули б
 *   єдиний справжній `user_id_mismatch`.
 * - `id` проганяється через `Number()` (Hard Rule #1 — `bigint` → `number`),
 *   так само як у {@link countOutboxByStatus}.
 * - Read-only: без `UPDATE`/`DELETE`/транзакцій.
 */

export interface RejectedOutboxRow {
  readonly id: number;
  readonly tableName: string;
  readonly op: string;
  readonly rejectReason: string | null;
  readonly createdAt: string;
}

export interface ListRejectedOutboxOptions {
  /** Скільки рядків повернути. За замовчуванням 50. */
  readonly limit?: number;
  /**
   * Причини, які НЕ показувати — напр. `lww_conflict`, штатний результат
   * last-write-wins, який не є втратою даних.
   */
  readonly excludeReasons?: readonly string[];
}

interface RejectedRowFromDb extends Record<string, unknown> {
  id: number | bigint;
  table_name: string;
  op: string;
  reject_reason: string | null;
  created_at: string;
}

const DEFAULT_LIMIT = 50;

export async function listRejectedOutbox(
  client: SqliteMigrationClient,
  options: ListRejectedOutboxOptions = {},
): Promise<RejectedOutboxRow[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(
      `listRejectedOutbox: limit must be a positive integer, got ${JSON.stringify(limit)}`,
    );
  }
  const excluded = options.excludeReasons ?? [];
  const excludeClause =
    excluded.length > 0
      ? ` AND (reject_reason IS NULL OR reject_reason NOT IN (${excluded.map(() => "?").join(", ")}))`
      : "";

  const rows = await client.all<RejectedRowFromDb>(
    `SELECT id, table_name, op, reject_reason, created_at
       FROM sync_op_outbox
      WHERE status = 'rejected'${excludeClause}
      ORDER BY id DESC
      LIMIT ?`,
    [...excluded, limit],
  );

  return rows.map((row) => {
    const id = Number(row.id);
    if (!Number.isFinite(id) || !Number.isInteger(id)) {
      throw new Error(
        `listRejectedOutbox: non-integer id ${JSON.stringify(row.id)} in sync_op_outbox`,
      );
    }
    return {
      id,
      tableName: row.table_name,
      op: row.op,
      rejectReason: row.reject_reason,
      createdAt: row.created_at,
    };
  });
}
