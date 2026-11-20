/**
 * Годинник людини для проходу нагадувань: пояс, доба, хвилина, тихі години
 * і стеля на добу.
 *
 * Спека: docs/work/specs/notifications-quiet-hours-and-device-time.md.
 *
 * До цієї спеки весь прохід рахував добу й хвилину за Києвом, а відмітки
 * звичок пишуться за днем пристрою (ADR-0078): людина в Нью-Йорку отримувала
 * звичку «о 07:00» о 00:00 свого часу, а прохід питав відмітки не тієї доби.
 * Тепер кожна людина має власний годинник у поясі, який останнім записав її
 * клієнт (`user_preferences.time_zone`); пояс невідомий = Europe/Kyiv, тож
 * для людини в Україні нічого не змінилось.
 *
 * Модуль окремо від `./sweep.ts`, бо той уже за межею `max-lines`
 * (Hard Rule #18): тут уся нова логіка, у проході лише виклики.
 */

import type { Pool } from "pg";

import {
  PUSH_DAILY_CAP_DEFAULT,
  QUIET_HOURS_DEFAULT_END_MIN,
  QUIET_HOURS_DEFAULT_START_MIN,
} from "@sergeant/shared";

import {
  catchUpFromHmIn,
  dayKeyIn,
  hmIn,
  resolveUserTimeZone,
  type QuietWindow,
} from "./time.js";

export interface UserClock {
  /** IANA-пояс, у якому рахується все нижче. */
  timeZone: string;
  /** День-ключ `YYYY-MM-DD` людини: відмітки, дедуп, слоти бюджету. */
  dayKey: string;
  /** Поточна хвилина `HH:MM` людини. */
  hm: string;
  /** Нижня межа наздоганяння пропущених хвилин (`catchUpFromHmIn`). */
  fromHm: string;
  /** Стеля нагадувань на добу (міграція 148). */
  cap: number;
  /** Тихі години людини; `null` = вимкнені. */
  quiet: QuietWindow | null;
}

/** Рядок `user_preferences` у тій формі, яку читає прохід. */
export interface UserClockRow {
  user_id: string;
  push_daily_cap?: unknown;
  time_zone?: unknown;
  quiet_hours_enabled?: unknown;
  quiet_hours_start_min?: unknown;
  quiet_hours_end_min?: unknown;
}

function minuteOr(value: unknown, fallback: number): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < 24 * 60
    ? value
    : fallback;
}

/**
 * Годинник із рядка налаштувань. Відсутній рядок (людина ніколи не
 * зберігала налаштувань) і відсутні колонки дають дефолти колонок
 * міграцій 148 і 168: стеля 2, тихі години 22:00-08:00 увімкнені, Київ.
 */
export function userClockFromRow(
  row: UserClockRow | undefined,
  now: Date,
  lastSweepAt: Date | null,
): UserClock {
  const timeZone = resolveUserTimeZone(row?.time_zone);
  const startMin = minuteOr(
    row?.quiet_hours_start_min,
    QUIET_HOURS_DEFAULT_START_MIN,
  );
  const endMin = minuteOr(
    row?.quiet_hours_end_min,
    QUIET_HOURS_DEFAULT_END_MIN,
  );
  const enabled = row?.quiet_hours_enabled !== false && startMin !== endMin;
  return {
    timeZone,
    dayKey: dayKeyIn(now, timeZone),
    hm: hmIn(now, timeZone),
    fromHm: catchUpFromHmIn(now, lastSweepAt, timeZone),
    cap:
      typeof row?.push_daily_cap === "number"
        ? row.push_daily_cap
        : PUSH_DAILY_CAP_DEFAULT,
    quiet: enabled ? { startMin, endMin } : null,
  };
}

/** Годинники людей, яким цей прохід може щось надіслати. */
export interface UserClocks {
  /** Годинник людини; без рядка налаштувань - дефолтний. */
  of(userId: string): UserClock;
}

/**
 * Пояс, тихі години і стеля для `userIds` одним запитом за PK (замінив
 * окремий запит стелі). Годинник людини без рядка рахується один раз.
 */
export async function loadUserClocks(
  pool: Pool,
  userIds: readonly string[],
  now: Date,
  lastSweepAt: Date | null,
): Promise<UserClocks> {
  const clocks = new Map<string, UserClock>();
  const ids = [...new Set(userIds)];
  if (ids.length > 0) {
    const { rows } = await pool.query<UserClockRow>(
      `SELECT user_id, push_daily_cap, time_zone, quiet_hours_enabled,
              quiet_hours_start_min, quiet_hours_end_min
         FROM user_preferences
        WHERE user_id = ANY($1)`,
      [ids],
    );
    for (const row of rows) {
      clocks.set(row.user_id, userClockFromRow(row, now, lastSweepAt));
    }
  }
  const fallback = userClockFromRow(undefined, now, lastSweepAt);
  return { of: (userId) => clocks.get(userId) ?? fallback };
}

/**
 * Люди, згруповані за власним день-ключем. На практиці два-три різні
 * ключі на хвилину, тож запити відміток ідуть раз на ключ, а не на людину.
 */
export function groupByDayKey(
  userIds: readonly string[],
  clocks: UserClocks,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const userId of new Set(userIds)) {
    const { dayKey } = clocks.of(userId);
    const list = out.get(dayKey);
    if (list) list.push(userId);
    else out.set(dayKey, [userId]);
  }
  return out;
}

/**
 * Виконати `load` раз на кожен день-ключ і злити результати за людиною.
 * Кожна людина лежить рівно в одній групі, тож ключі мап не перетинаються.
 */
export async function loadPerDayKey<T>(
  userIds: readonly string[],
  clocks: UserClocks,
  load: (ids: string[], dayKey: string) => Promise<Map<string, T>>,
): Promise<Map<string, T>> {
  const parts = await Promise.all(
    [...groupByDayKey(userIds, clocks)].map(([dayKey, ids]) =>
      load(ids, dayKey),
    ),
  );
  return new Map(parts.flatMap((part) => [...part]));
}
