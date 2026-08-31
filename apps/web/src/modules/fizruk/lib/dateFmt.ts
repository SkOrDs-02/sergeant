/**
 * Last validated: 2026-08-31
 * Status: Active
 *
 * Короткий формат дати для сторінок Фізрука.
 *
 * Тонка обгортка над канонічним `formatDayKeyUk`
 * (`docs/90-work/audits/unification-modules.md` §2.6): дев'ять копій
 * підпису «день + скорочений місяць» звело до одного форматера. Межу року
 * як і раніше бере годинник ПРИСТРОЮ (ADR-0078): це особистий запис
 * користувача, а не серверний звіт, тож «цей рік» означає рік там, де
 * людина стоїть, а не в Києві.
 */

import { deviceDayKey } from "@sergeant/shared";
import { formatDayKeyUk } from "@shared/lib/time/dayKeyLabel";

/**
 * `7 серп` для дат цього року, `7 серп 2025` для попередніх.
 *
 * @param value ISO-рядок, timestamp або `Date`.
 * @returns Порожній рядок, якщо дату розібрати не вдалось.
 */
export function formatShortDate(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const ts = date.getTime();
  if (!Number.isFinite(ts)) return "";
  return formatDayKeyUk(deviceDayKey(date), {
    todayKey: deviceDayKey(),
    relative: false,
  });
}
