/**
 * Валідація полів розкладу звички (`recurrence`, `start_date`, `end_date`).
 *
 * Колонки `routine_habits.recurrence/start_date/end_date` — TEXT без CHECK, а
 * домен (`parseDateKey` у `habitScheduledOnDate`) на невалідному ключі кидає.
 * Один отруєний рядок валив щохвилинний sweep нагадувань усім користувачам
 * (аудит 2026-10-01, rel-01). Ці примітиви стоять і на вході (`applySync`),
 * і на читанні (`reminders/sweep.ts`), тому живуть у легкому модулі без БД.
 *
 * Ключ НЕ деривується і не зсувається за часовим поясом (ADR-0078):
 * перевіряється лише валідність того, що надіслав клієнт.
 */

import { RECURRENCE_OPTIONS } from "@sergeant/routine-domain";

const DAY_KEY_SHAPE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Чи є рядок реальним календарним днем `YYYY-MM-DD`.
 *
 * Лише форма пропустила б `2026-13-45`, яке `new Date(y, m - 1, d)` мовчки
 * перекочує на інший день, тож дату збираємо назад і звіряємо компоненти.
 */
export function isValidDayKey(value: string): boolean {
  const m = DAY_KEY_SHAPE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === mo - 1 &&
    probe.getUTCDate() === d
  );
}

/**
 * Необовʼязковий day-ключ з sync-рядка або з БД.
 *
 * `null` / `undefined` / порожній рядок -> `null` (домен читає порожнє як
 * «не задано»: `habit.startDate || …`). Не-рядок або не-дата -> `"invalid"`.
 * Значення вертається як є, без перетворень.
 */
export function parseOptionalDayKey(value: unknown): string | null | "invalid" {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return "invalid";
  return isValidDayKey(value) ? value : "invalid";
}

/** Закритий набір режимів повторення (канон `RECURRENCE_OPTIONS` домену). */
const RECURRENCES: ReadonlySet<string> = new Set(
  RECURRENCE_OPTIONS.map((o) => o.value),
);

/**
 * Відсутнє / порожнє `recurrence` валідне (= `daily`: старі клієнти, домен
 * читає `recurrence || "daily"`). Будь-що інше мусить бути з enum-а.
 */
export function isValidRecurrence(value: unknown): boolean {
  if (value == null || value === "") return true;
  return typeof value === "string" && RECURRENCES.has(value);
}
