/**
 * Чи слати push про нову операцію Monobank.
 *
 * Спека: docs/work/specs/notifications-quiet-hours-and-device-time.md.
 * Порядок перевірок (рішення founder-а П-22 (А), Б-1 (А)): тумблер «Операції
 * Monobank» вимкнений → не слати; тихі години увімкнені і поточна хвилина в
 * поясі людини у вікні → не слати зовсім, без ранкового зведення і без
 * беззвучної доставки; інакше слати як раніше. Операція при цьому
 * записується як завжди, людина бачить її у Фініку.
 *
 * Push Monobank не входить у стелю нагадувань `push_daily_cap`.
 */

import { query } from "../../db.js";
import { logger, serializeError } from "../../obs/logger.js";
import {
  hmIn,
  hmToMinute,
  isInQuietWindow,
  resolveUserTimeZone,
} from "../../lib/reminders/time.js";
import { serializeNotificationPrefs } from "../me/notificationPrefs.js";

export type MonoPushVerdict = "send" | "disabled" | "quiet_hours";

/**
 * Вердикт за рядком `user_preferences`. Відсутній рядок (людина ніколи не
 * зберігала налаштувань) = дефолти колонок міграції 168: тумблер увімкнений,
 * тихі години 22:00-08:00, пояс невідомий (Київ).
 */
export function monoPushVerdict(
  row: Record<string, unknown> | undefined,
  now: Date,
): MonoPushVerdict {
  const prefs = serializeNotificationPrefs(row);
  if (!prefs.pushMonoTransactions) return "disabled";
  const minute = hmToMinute(hmIn(now, resolveUserTimeZone(prefs.timeZone)));
  const quiet = isInQuietWindow(minute, {
    enabled: prefs.quietHoursEnabled,
    startMin: prefs.quietHoursStartMin,
    endMin: prefs.quietHoursEndMin,
  });
  return quiet ? "quiet_hours" : "send";
}

/**
 * Одне читання налаштувань людини за PK. Збій читання не валить вебхук
 * (відповідь Monobank уже віддано) і читається дефолтами колонок, тобто
 * так само, як людина без рядка налаштувань.
 */
export async function loadMonoPushVerdict(
  userId: string,
  now: Date,
): Promise<MonoPushVerdict> {
  let row: Record<string, unknown> | undefined;
  try {
    const result = await query<Record<string, unknown>>(
      `SELECT time_zone, quiet_hours_enabled, quiet_hours_start_min,
              quiet_hours_end_min, push_mono_transactions
         FROM user_preferences
        WHERE user_id = $1`,
      [userId],
      { op: "mono_push_prefs" },
    );
    row = result.rows[0];
  } catch (err) {
    logger.warn({
      msg: "mono_push_prefs_read_failed",
      err: serializeError(err, { includeStack: false }),
    });
  }
  return monoPushVerdict(row, now);
}
