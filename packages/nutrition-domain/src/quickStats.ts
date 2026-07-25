/**
 * Hub nutrition quick-stats snapshot — the figures the Hub bento card
 * shows for the nutrition module (`todayCal` / `calGoal`).
 *
 * Reuses `getDayMacros` (the same day-total the NutritionDashboard shows)
 * so the card can never drift from the module, and reads the daily kcal
 * target straight from prefs. The Kyiv day boundary lives in the caller —
 * `dayKey` is passed in as a `YYYY-MM-DD` key, matching `getDayMacros`.
 */

import { getDayMacros } from "./nutritionLog.js";
import type { NutritionLogLike, NutritionPrefs } from "./nutritionTypes.js";

export interface NutritionQuickStats {
  /** Total kcal logged for `dayKey`, rounded. */
  todayCal: number;
  /** Daily kcal target, or `0` when the user has not set one. */
  calGoal: number;
}

export function computeNutritionQuickStats(
  log: NutritionLogLike,
  prefs: Pick<NutritionPrefs, "dailyTargetKcal"> | null | undefined,
  dayKey: string,
): NutritionQuickStats {
  return {
    todayCal: Math.round(getDayMacros(log, dayKey).kcal),
    calGoal: prefs?.dailyTargetKcal ?? 0,
  };
}

export interface NutritionPeriodAverages {
  /** Середні за день значення; знаменник — `daysLogged`. */
  avgKcal: number;
  avgProtein: number;
  avgFat: number;
  avgCarbs: number;
  /** Сумарні значення за період (без округлення знаменника). */
  totalKcal: number;
  /** Кількість днів періоду, де є хоча б один прийом їжі. */
  daysLogged: number;
  /** Скільки днів узагалі було в періоді (довжина `dayKeys`). */
  daysInPeriod: number;
}

/**
 * Канонічні середні КБЖВ за період.
 *
 * AI-CONTEXT: знаменник — **дні з ≥1 прийомом їжі**, а не всі дні періоду і
 * не «дні, для яких існує ключ у лозі». Це ратифікована семантика канону
 * (`docs/01-product/model/nutrition.md` §5.2 «Неповний день позначається»:
 * пропущений день — це неповні дані, а не нульове споживання, тож він не
 * тягне статистику в дефіцит). Тижневий дайджест
 * (`apps/web/src/core/insights/useWeeklyDigest.ts` → `aggregateNutrition`)
 * уже так рахує; Hub-Reports (`hubReports.aggregation.ts` → `aggregateKcal`)
 * бере знаменником `Object.keys(daily).length`, тобто день із наявним, але
 * порожнім записом занижує середнє.
 *
 * W1-CANON-AGG стадія 1 — additive: функція нікого не перемикає, переведення
 * Hub-Reports на цю семантику — стадія 4. Реєстр розбіжностей:
 * `docs/02-engineering/architecture/metric-registry.md`.
 *
 * Межі доби задає викликач (`dayKeys` у форматі `YYYY-MM-DD`, Europe/Kyiv за
 * доменним інваріантом) — функція DOM-free і без власного годинника.
 */
export function calcNutritionPeriodAverages(
  log: NutritionLogLike,
  dayKeys: readonly string[],
): NutritionPeriodAverages {
  const keys = Array.isArray(dayKeys) ? dayKeys : [];
  let totalKcal = 0;
  let totalProtein = 0;
  let totalFat = 0;
  let totalCarbs = 0;
  let daysLogged = 0;

  for (const dk of keys) {
    const day = log?.[dk];
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    if (meals.length === 0) continue;
    daysLogged += 1;
    const macros = getDayMacros(log, dk);
    totalKcal += macros.kcal;
    totalProtein += macros.protein_g;
    totalFat += macros.fat_g;
    totalCarbs += macros.carbs_g;
  }

  const div = daysLogged > 0 ? daysLogged : 1;
  return {
    avgKcal: daysLogged > 0 ? Math.round(totalKcal / div) : 0,
    avgProtein: daysLogged > 0 ? Math.round(totalProtein / div) : 0,
    avgFat: daysLogged > 0 ? Math.round(totalFat / div) : 0,
    avgCarbs: daysLogged > 0 ? Math.round(totalCarbs / div) : 0,
    totalKcal: Math.round(totalKcal),
    daysLogged,
    daysInPeriod: keys.length,
  };
}
