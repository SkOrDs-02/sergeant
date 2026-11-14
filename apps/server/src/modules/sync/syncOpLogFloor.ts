import { SYNC_CURSOR_EXPIRED_CODE } from "@sergeant/shared";
import { AppError } from "../../obs/errors.js";

/**
 * Нижня межа журналу `sync_op_log` per-user (міграція 166, ADR-0105 §3).
 *
 * `sync_op_log_floor.floor_id` - максимальний `id`, видалений retention-ом
 * `applied`-оп-ів для користувача. Курсор pull, старший за межу, вже не
 * може «продовжити з курсора»: оп-и між `since` і `floor_id` видалено, і
 * пристрій тихо втратив би зміни. Тому pull відповідає 410
 * `sync_cursor_expired`, а клієнт відновлюється через
 * `GET /api/v2/sync/snapshot` і ставить курсор на `as_of_op_id`.
 *
 * AI-CONTEXT: поки retention вимкнений (крок 4 ADR-0105), таблицю ніхто не
 * пише, рядка немає, межа 0, і 410 недосяжний: `since >= 0` завжди. Межу
 * піднімає лише retention-крок у тій самій транзакції, що й `DELETE`.
 */

/**
 * SQL-вираз межі користувача `$1` (0, коли рядка немає). Один вираз на pull
 * і snapshot, щоб обидва бачили ту саму семантику «немає рядка = 0».
 */
export const SYNC_OP_LOG_FLOOR_SQL = `COALESCE(
  (SELECT floor_id FROM sync_op_log_floor WHERE user_id = $1), 0
)`;

/** `since` прострочений, коли він менший за ненульову межу. */
export function isCursorExpired(since: number, floorId: number): boolean {
  return floorId > 0 && since < floorId;
}

/**
 * 410 `sync_cursor_expired`. `floor_id` їде в `details` тіла помилки
 * (`errorHandler` віддає `cause.details` для 4xx), щоб клієнт міг
 * залогувати, наскільки курсор відстав; для відновлення він не потрібен.
 */
export class SyncCursorExpiredError extends AppError {
  readonly floorId: number;

  constructor(floorId: number) {
    super("Курсор синхронізації застарів, потрібен повний знімок", {
      status: 410,
      code: SYNC_CURSOR_EXPIRED_CODE,
      cause: { details: [{ floor_id: floorId }] },
    });
    this.name = "SyncCursorExpiredError";
    this.floorId = floorId;
  }
}
