/**
 * «✕» ховає картку до кінця ПОТОЧНОЇ особистої доби, а не назавжди.
 *
 * Рішення власника 2026-10-01 (hub-coach § Журнал рішень). Причина: id правил
 * рекомендацій статичні (`fizruk_long_break`, `spending_velocity_high`, …),
 * тож колишній «✕ назавжди» глушив сигнал на ціле життя акаунта; до того ж
 * сховище інсайтів було масивом id без жодної мітки часу.
 *
 * Межа доби — годинник ПРИСТРОЮ ([ADR-0078](../../../../../../docs/governance/adr/0078-day-boundary-device-local.md)),
 * `deviceDayKey`, а не Київ: відкидання — особиста дія, і про «сьогодні» тут
 * вирішує те, що показує телефон людини.
 *
 * Формат запису — `{ [id]: ts }` (мс епохи, `Date.now()` у момент ✕). Усе, що
 * не є скінченним додатним числом (`true`, `0`, рядок, елемент старого масиву),
 * — ЗАСТАРІЛИЙ запис без мітки і вважається простроченим: старі «назавжди»
 * відкидання так повертаються рівно один раз і далі живуть уже за новим
 * правилом.
 */
import { deviceDayKey } from "@sergeant/shared";

/** `id` → момент відкидання (мс епохи). */
export type DismissalMap = Record<string, number>;

/** Чи відкинуто саме СЬОГОДНІ (за годинником пристрою). */
export function isDismissedToday(
  ts: unknown,
  now: Date | number = new Date(),
): boolean {
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) return false;
  return deviceDayKey(ts) === deviceDayKey(now);
}

/**
 * Лише діючі сьогодні відкидання. Масив (старий формат інсайтів), `null` і
 * будь-який не-обʼєкт дають порожню мапу. Викликається на запис, щоб сховище
 * не накопичувало прострочені id.
 */
export function dismissalsOfToday(
  raw: unknown,
  now: Date | number = new Date(),
): DismissalMap {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: DismissalMap = {};
  for (const [id, ts] of Object.entries(raw)) {
    if (isDismissedToday(ts, now)) out[id] = ts as number;
  }
  return out;
}
