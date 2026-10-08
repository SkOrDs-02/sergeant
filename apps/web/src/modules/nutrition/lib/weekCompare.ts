/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import {
  addDeviceDays,
  calcNutritionPeriodAverages,
  deviceWeekStartKey,
  type NutritionLog,
} from "@sergeant/nutrition-domain";

export type WeekCompare =
  | { kind: "none" }
  | { kind: "compared"; prevAvgKcal: number; deltaKcal: number };

function weekKeys(mondayKey: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDeviceDays(mondayKey, i));
}

/**
 * Середні ккал тижня (ISO, з понеділка, день-ключ пристрою, ADR-0078), що
 * містить `dateKey`, проти попереднього тижня.
 *
 * Порівнюємо лише коли ОБИДВА тижні мають записи: порожній тиждень це
 * неповні дані, а не нуль (канон §5.2), і різниця проти нього дає
 * безглузді «+100 %». Різницю рахуємо з точних сум, відсотків не показуємо.
 */
export function compareWeekToPrevious(
  log: NutritionLog,
  dateKey: string,
): WeekCompare {
  const [y, m, d] = dateKey.split("-").map(Number);
  const monday = deviceWeekStartKey(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const cur = calcNutritionPeriodAverages(log, weekKeys(monday));
  const prev = calcNutritionPeriodAverages(
    log,
    weekKeys(addDeviceDays(monday, -7)),
  );
  if (cur.daysLogged === 0 || prev.daysLogged === 0) return { kind: "none" };
  const prevExact = prev.totalKcal / prev.daysLogged;
  const curExact = cur.totalKcal / cur.daysLogged;
  return {
    kind: "compared",
    prevAvgKcal: Math.round(prevExact),
    deltaKcal: Math.round(curExact - prevExact),
  };
}
