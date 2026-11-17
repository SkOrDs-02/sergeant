import type { SqliteMigrationClient } from "../migrate/adapters/sqlite.js";

import {
  SYNC_OP_OUTBOX_PURGEABLE_STATUSES,
  SYNC_OP_OUTBOX_STALE_TTL_DAYS,
} from "./syncOpOutboxPurgeStale.js";

/**
 * Прогноз TTL-чистки клієнтської `sync_op_outbox`: скільки незасинхронених
 * термінальних рядків {@link purgeStaleTerminalOutbox} видалить найближчим
 * часом і коли саме.
 *
 * PR-T2 (`docs/work/specs/audits/2026-09-13-product-full-review.md`):
 * пост-фактум слід (`outboxPurgeNotice.ts` у `apps/web`) зʼявляється, коли
 * рядки вже видалені. Цей запит дає попередження ДО чистки, поки людина ще
 * може натиснути «Повторити синхронізацію» для `dead_letter`.
 *
 * Предикат дзеркалить чистку: ті самі статуси
 * ({@link SYNC_OP_OUTBOX_PURGEABLE_STATUSES}, без `pending` і `quarantined`),
 * той самий вік через `julianday()`; нерозбірний `created_at` дає `NULL` і в
 * прогноз не потрапляє (чистка такого рядка теж не видалить).
 */

/**
 * За скільки днів до TTL-чистки показувати попередження. Тиждень: досить,
 * щоб людина, яка відкриває застосунок раз на кілька днів, устигла побачити
 * попередження хоча б раз і повторити синхронізацію.
 */
export const SYNC_OP_OUTBOX_PURGE_WARNING_DAYS = 7;

export interface ForecastStaleTerminalOutboxPurgeOptions {
  /** Вікно TTL; за замовчуванням {@link SYNC_OP_OUTBOX_STALE_TTL_DAYS}. */
  readonly olderThanDays?: number;
  /**
   * За скільки днів до чистки рядок уже потрапляє в прогноз; за
   * замовчуванням {@link SYNC_OP_OUTBOX_PURGE_WARNING_DAYS}. Має бути
   * `> 0` і `<= olderThanDays`.
   */
  readonly warnWithinDays?: number;
  /**
   * Причини `rejected`, які не є втратою даних (напр. `lww_conflict`) і
   * тому не варті попередження. На `dead_letter` фільтр не діє.
   */
  readonly excludeRejectReasons?: readonly string[];
  /** Лише рядки цього власника (kvvfs-партиції ділять один стор). */
  readonly userId?: string | undefined;
}

export interface StaleTerminalOutboxPurgeForecast {
  /** Скільки рядків чистка забере протягом вікна попередження. */
  readonly count: number;
  /**
   * Найраніший момент (UTC ISO), після якого наступний запуск застосунку
   * видалить найстаріший із цих рядків. `null`, коли `count === 0`. Може
   * бути в минулому: чистка йде лише на буті, тож рядок, що переріс TTL
   * посеред сесії, лежить до наступного запуску.
   */
  readonly earliestPurgeAtIso: string | null;
}

export async function forecastStaleTerminalOutboxPurge(
  client: SqliteMigrationClient,
  options: ForecastStaleTerminalOutboxPurgeOptions = {},
): Promise<StaleTerminalOutboxPurgeForecast> {
  const olderThanDays = options.olderThanDays ?? SYNC_OP_OUTBOX_STALE_TTL_DAYS;
  const warnWithinDays =
    options.warnWithinDays ?? SYNC_OP_OUTBOX_PURGE_WARNING_DAYS;
  if (!Number.isFinite(olderThanDays) || olderThanDays <= 0) {
    throw new Error(
      `forecastStaleTerminalOutboxPurge: olderThanDays must be a finite number > 0, ` +
        `got ${JSON.stringify(olderThanDays)}`,
    );
  }
  if (
    !Number.isFinite(warnWithinDays) ||
    warnWithinDays <= 0 ||
    warnWithinDays > olderThanDays
  ) {
    throw new Error(
      `forecastStaleTerminalOutboxPurge: warnWithinDays must be in (0, olderThanDays], ` +
        `got ${JSON.stringify(warnWithinDays)}`,
    );
  }
  if (options.userId !== undefined && options.userId.length === 0) {
    throw new Error(
      `forecastStaleTerminalOutboxPurge: userId, when provided, must be non-empty`,
    );
  }

  const statuses = SYNC_OP_OUTBOX_PURGEABLE_STATUSES;
  const excluded = options.excludeRejectReasons ?? [];
  const params: unknown[] = [
    olderThanDays,
    ...statuses,
    olderThanDays - warnWithinDays,
  ];
  let where =
    `WHERE status IN (${statuses.map(() => "?").join(", ")})` +
    ` AND julianday('now') - julianday(created_at) > ?`;
  if (excluded.length > 0) {
    where +=
      ` AND (status <> 'rejected' OR reject_reason IS NULL` +
      ` OR reject_reason NOT IN (${excluded.map(() => "?").join(", ")}))`;
    params.push(...excluded);
  }
  if (options.userId !== undefined) {
    where += ` AND user_id = ?`;
    params.push(options.userId);
  }

  const rows = await client.all<{
    count: number | bigint;
    earliest: string | null;
  }>(
    `SELECT COUNT(*) AS count,
            strftime('%Y-%m-%dT%H:%M:%SZ', MIN(julianday(created_at)) + ?) AS earliest
       FROM sync_op_outbox ${where}`,
    params,
  );
  const count = Number(rows[0]?.count ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(
      `forecastStaleTerminalOutboxPurge: non-integer count ${JSON.stringify(String(rows[0]?.count))}`,
    );
  }
  return {
    count,
    earliestPurgeAtIso: count > 0 ? (rows[0]?.earliest ?? null) : null,
  };
}
