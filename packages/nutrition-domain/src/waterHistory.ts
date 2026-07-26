/**
 * Pure-helpers для історії журналу води: last-N-days вибірка, середні за
 * 7/30 днів, поточна серія днів із досягнутою ціллю. Kyiv-межі доби беруться
 * з `@sergeant/shared` (`toLocalISODate` / `kyivDayStartMs`) — той самий
 * генератор ключа, що й `getTodayWaterMl` у `waterLog.ts`, аби «сьогодні» в
 * історії завжди збігалося з «сьогодні» в трекері.
 */
import { toLocalISODate, kyivDayStartMs } from "@sergeant/shared";
import { normalizeWaterLog, type WaterLog } from "./waterLog.js";

export interface WaterHistoryDay {
  dayKey: string;
  ml: number;
}

/**
 * Попередній Kyiv-день ключ (DST-safe: один ms до початку дня `key`).
 * Експортована — UI-шар (day-list "Сьогодні/Вчора" formatter) реюзить той
 * самий генератор, щоб не дублювати DST-логіку.
 */
export function getPreviousWaterDayKey(key: string): string {
  return toLocalISODate(kyivDayStartMs(key) - 1);
}
const prevDayKey = getPreviousWaterDayKey;

/**
 * Останні `count` Kyiv-днів, що закінчуються "сьогодні" (`referenceMs`),
 * найстаріший день першим. Дні без запису → `ml: 0`.
 */
export function getWaterLastNDays(
  log: unknown,
  count: number,
  referenceMs: number = Date.now(),
): WaterHistoryDay[] {
  const normalized = normalizeWaterLog(log);
  if (count <= 0) return [];
  const keys: string[] = [];
  let key = toLocalISODate(referenceMs);
  for (let i = 0; i < count; i++) {
    keys.push(key);
    key = prevDayKey(key);
  }
  keys.reverse();
  return keys.map((dayKey) => ({ dayKey, ml: normalized[dayKey] ?? 0 }));
}

/** Середнє мл/день за останні `days` Kyiv-днів (дні без запису рахуються як 0). */
export function getWaterAverageMl(
  log: unknown,
  days: number,
  referenceMs: number = Date.now(),
): number {
  if (days <= 0) return 0;
  const list = getWaterLastNDays(log, days, referenceMs);
  const sum = list.reduce((acc, d) => acc + d.ml, 0);
  return Math.round(sum / days);
}

/**
 * Поточна серія послідовних Kyiv-днів із досягнутою ціллю, рахуючи назад
 * від сьогодні. Якщо ціль на сьогодні ще не досягнута, сьогоднішній день не
 * рахується як «зрив» серії (день ще не завершився) — відлік просто
 * починається з учора.
 */
export function getWaterStreak(
  log: unknown,
  goalMl: number,
  referenceMs: number = Date.now(),
): number {
  if (!(goalMl > 0)) return 0;
  const normalized = normalizeWaterLog(log);
  let key = toLocalISODate(referenceMs);
  if ((normalized[key] ?? 0) < goalMl) key = prevDayKey(key);
  let streak = 0;
  while ((normalized[key] ?? 0) >= goalMl) {
    streak++;
    key = prevDayKey(key);
  }
  return streak;
}

export type { WaterLog };
