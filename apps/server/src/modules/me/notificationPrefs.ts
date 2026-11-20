/**
 * Налаштування сповіщень із міграції 168: пояс пристрою, тихі години і
 * тумблер push Monobank; з міграції 175 ще тумблер push Фініка (ліміти й
 * платежі, спека `finyk-limit-and-recurring-push.md`). Серіалізація й валідація патча для
 * `/api/me/preferences` (`./dataRights.ts`).
 *
 * Спека: docs/work/specs/notifications-quiet-hours-and-device-time.md.
 *
 * Окремо від `dataRights.ts`, бо той уже біля межі `max-lines`
 * (Hard Rule #18), а ці поля мають власну валідацію, якої в сусідів немає.
 */

import type { UserPreferences, UserPreferencesPatch } from "@sergeant/shared";
import {
  QUIET_HOURS_DEFAULT_END_MIN,
  QUIET_HOURS_DEFAULT_START_MIN,
} from "@sergeant/shared";

import { isValidTimeZone } from "../../lib/reminders/time.js";
import { ValidationError } from "../../obs/errors.js";

export interface NotificationPrefs {
  timeZone: string | null;
  quietHoursEnabled: boolean;
  quietHoursStartMin: number;
  quietHoursEndMin: number;
  pushMonoTransactions: boolean;
  pushFinykAlerts: boolean;
}

/**
 * Дефолти = `DEFAULT` колонок міграції 168 і поведінка до неї: пояс
 * невідомий (сервер читає Київ), тихі години 22:00-08:00 увімкнені, push
 * Monobank увімкнений.
 */
export const NOTIFICATION_PREF_DEFAULTS: NotificationPrefs = {
  timeZone: null,
  quietHoursEnabled: true,
  quietHoursStartMin: QUIET_HOURS_DEFAULT_START_MIN,
  quietHoursEndMin: QUIET_HOURS_DEFAULT_END_MIN,
  pushMonoTransactions: true,
  // Міграція 175: `DEFAULT TRUE` (відповідь власника 2026-11-19).
  pushFinykAlerts: true,
};

function minuteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : fallback;
}

/**
 * DB → API. Рядок без колонок (до міграції 168, ручний запит) читається
 * дефолтами, а не `undefined`: новий сервер віддає ці поля завжди, бо їх
 * відсутність у відповіді веб читає як ознаку старого сервера.
 */
export function serializeNotificationPrefs(
  row: Record<string, unknown> | undefined,
): NotificationPrefs {
  const d = NOTIFICATION_PREF_DEFAULTS;
  if (!row) return { ...d };
  return {
    timeZone: typeof row["time_zone"] === "string" ? row["time_zone"] : null,
    quietHoursEnabled: row["quiet_hours_enabled"] !== false,
    quietHoursStartMin: minuteOr(
      row["quiet_hours_start_min"],
      d.quietHoursStartMin,
    ),
    quietHoursEndMin: minuteOr(row["quiet_hours_end_min"], d.quietHoursEndMin),
    pushMonoTransactions: row["push_mono_transactions"] !== false,
    pushFinykAlerts: row["push_finyk_alerts"] !== false,
  };
}

/**
 * Патч поверх поточних значень. Невалідний IANA-пояс і однакові межі тихих
 * годин дають `400` до запису: межі перевіряються після злиття, бо патч
 * може змінити лише одну з них. CHECK у БД - остання лінія.
 */
export function mergeNotificationPrefs(
  current: Pick<UserPreferences, keyof NotificationPrefs>,
  patch: UserPreferencesPatch,
): NotificationPrefs {
  const base = { ...NOTIFICATION_PREF_DEFAULTS, ...definedOnly(current) };
  const next: NotificationPrefs = {
    timeZone: patch.timeZone ?? base.timeZone,
    quietHoursEnabled: patch.quietHoursEnabled ?? base.quietHoursEnabled,
    quietHoursStartMin: patch.quietHoursStartMin ?? base.quietHoursStartMin,
    quietHoursEndMin: patch.quietHoursEndMin ?? base.quietHoursEndMin,
    pushMonoTransactions:
      patch.pushMonoTransactions ?? base.pushMonoTransactions,
    pushFinykAlerts: patch.pushFinykAlerts ?? base.pushFinykAlerts,
  };
  if (patch.timeZone !== undefined && !isValidTimeZone(patch.timeZone)) {
    throw new ValidationError("Невідомий часовий пояс", {
      cause: { details: [{ path: "timeZone", message: "unknown IANA zone" }] },
    });
  }
  if (next.quietHoursStartMin === next.quietHoursEndMin) {
    throw new ValidationError("Початок і кінець тихих годин збігаються", {
      cause: {
        details: [
          { path: "quietHoursEndMin", message: "must differ from start" },
        ],
      },
    });
  }
  return next;
}

function definedOnly(
  value: Partial<Record<keyof NotificationPrefs, unknown>>,
): Partial<NotificationPrefs> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<NotificationPrefs>;
}
