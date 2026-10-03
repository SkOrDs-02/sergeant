import { deviceDayKey } from "./deviceDayKey.js";

export function fmtMacro(n: unknown): number | "—" {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Math.round(Number(n));
}

/**
 * `YYYY-MM-DD` за годинником ПРИСТРОЮ (ADR-0078) — це «сьогодні» журналу
 * харчування (лог, дашборд, quick-chips), не Kyiv: запис о 20:00 місцевого
 * часу мусить лягти на той день, який показує телефон користувача.
 */
export function todayISODate(): string {
  return deviceDayKey(new Date());
}
