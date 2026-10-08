import type { RequestHandler } from "express";
import { boolFromProcessEnv } from "../../env/envHelpers.js";
import { NotFoundError } from "../../obs/errors.js";

/**
 * Прапорець `SYNC_V2_STREAM_ENABLED` (дефолт `false`) — рубильник маршруту
 * `GET /api/v2/sync/stream`.
 *
 * Аудит 2026-10-01 (sec-09): жоден клієнт стрім не використовує (споживач —
 * Фаза 3, `sync-client-wiring.md`), а відкритий стрім доставляє живі
 * sync-операції (фінанси, харчування, здоровʼя) і після sign-out. Поки
 * споживача немає, маршрут не має існувати: вимкнений → 404, ніби його немає.
 *
 * Читаємо `process.env` на кожному запиті (`boolFromProcessEnv`), а не
 * знімок схеми, щоб тест перемикав прапорець без ре-імпорту, а ops - без
 * редеплою. Семантика збігається зі схемою `env.ts` (`boolFromEnv(false)`).
 */
export function isSyncV2StreamEnabled(): boolean {
  return boolFromProcessEnv("SYNC_V2_STREAM_ENABLED", false);
}

/**
 * Ставиться на маршрут стріму ДО pre-auth лімітера і `requireSession()`:
 * вимкнений маршрут однаково відповідає 404 і анонімові, і залогіненому, тож
 * 401/404 не вказують, чи існує поверхня.
 */
export function requireSyncV2StreamEnabled(): RequestHandler {
  return (_req, _res, next) => {
    if (isSyncV2StreamEnabled()) {
      next();
      return;
    }
    next(new NotFoundError("Not found"));
  };
}
