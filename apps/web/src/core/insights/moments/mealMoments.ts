/**
 * Моменти запису їжі (ADR-0096).
 *
 * Запис у сховище доїжджає асинхронно, тож «після» рахується з нового логу:
 * інсайт калорій отримує лог параметром, а ряди звʼязків замінюють стовпці
 * їжі на суми з нового логу (`withMetricReadings`). Решта модулів у рядах
 * лишається такою, як у сховищі: запис їжі їх не змінює.
 */

import {
  nutritionMacroReadings,
  withMetricReadings,
  type DailyMetric,
  type DailySeries,
} from "../../lib/chatActions/crossActions/dailySeries";
import {
  KCAL_INSIGHT_MIN_DAYS,
  KCAL_INSIGHT_MIN_PER_GROUP,
  workoutKcalGroups,
  workoutKcalInsight,
  type Workout,
} from "../../lib/insightsEngine";
import { isCrossModule, metricModule } from "../crossModuleLinkData";
import {
  CURATED_PAIRS,
  MIN_N,
  notablePairsFromSeries,
} from "../digestCorrelations";
import { approachRemaining, pickRarest, type Moment } from "./moments";

type NutritionLogShape = NonNullable<Parameters<typeof workoutKcalInsight>[1]>;

const NUTRITION_METRICS = ["kcal", "protein"] as const;

function isNutrition(metric: DailyMetric): boolean {
  return metricModule(metric) === "nutrition";
}

/**
 * Спільні дні пари: обидві метрики мають значення. Рахуємо тут, бо
 * `computePairwiseCorrelations` пари нижче порога не віддає зовсім, а
 * наближення цікавлять саме вони.
 */
function sharedDays(series: DailySeries, a: DailyMetric, b: DailyMetric) {
  const ca = series.raw[a] ?? [];
  const cb = series.raw[b] ?? [];
  let n = 0;
  for (let i = 0; i < ca.length; i++) {
    if (ca[i] !== undefined && cb[i] !== undefined) n++;
  }
  return n;
}

/** Ряд із нутрієнтними стовпцями, перерахованими з даного логу. */
export function seriesWithLog(
  series: DailySeries,
  log: NutritionLogShape,
): DailySeries {
  return NUTRITION_METRICS.reduce(
    (s, metric) =>
      metric in s.raw
        ? withMetricReadings(s, metric, nutritionMacroReadings(log, metric))
        : s,
    series,
  );
}

export interface MealMomentInput {
  prevLog: NutritionLogShape;
  nextLog: NutritionLogShape;
  workouts: Workout[];
  /** Ряди за вікно звʼязків (будь-якого стану їжі: стовпці їжі перераховуються). */
  series: DailySeries;
  target: string;
}

export function detectMealMoment({
  prevLog,
  nextLog,
  workouts,
  series,
  target,
}: MealMomentInput): Moment | null {
  const candidates: Moment[] = [];

  const kcalNow = workoutKcalInsight(workouts, nextLog);
  if (kcalNow && !workoutKcalInsight(workouts, prevLog)) {
    candidates.push({ kind: "threshold", target, detail: kcalNow.title });
  }

  const before = seriesWithLog(series, prevLog);
  const after = seriesWithLog(series, nextLog);
  const pairKey = (a: DailyMetric, b: DailyMetric) => `${a}|${b}`;
  const known = new Set(
    notablePairsFromSeries(before).map((p) => pairKey(p.a, p.b)),
  );
  const fresh = notablePairsFromSeries(after).find(
    (p) =>
      !known.has(pairKey(p.a, p.b)) &&
      isCrossModule(p.a, p.b) &&
      (isNutrition(p.a) || isNutrition(p.b)),
  );
  if (fresh) {
    candidates.push({ kind: "link", target, detail: fresh.phrase });
  }

  // Наближення до звʼязку: пара їжі з іншим модулем, якій бракує кількох
  // спільних днів. Про силу тут нічого не кажемо: до порога це не звʼязок
  // (ADR-0097), тож рядок обіцяє лише перевірку.
  const closest = CURATED_PAIRS.filter(
    (p) =>
      p.a in after.raw &&
      p.b in after.raw &&
      isCrossModule(p.a, p.b) &&
      (isNutrition(p.a) || isNutrition(p.b)),
  )
    .map((p) => ({ ...p, n: sharedDays(after, p.a, p.b) }))
    .filter((p) => approachRemaining(p.n, MIN_N) !== null)
    .sort((x, y) => y.n - x.n)[0];
  if (closest) {
    const other = isNutrition(closest.a) ? closest.b : closest.a;
    candidates.push({
      kind: "approach",
      target,
      value: approachRemaining(closest.n, MIN_N) ?? 0,
      detail: metricModule(other),
    });
  }

  // Наближення до висновку про калорії: лише коли в обох групах днів уже
  // досить і бракує тільки загальної кількості.
  if (!kcalNow) {
    const { kcalWorkout, kcalRest } = workoutKcalGroups(workouts, nextLog);
    const remaining = approachRemaining(
      kcalWorkout.length + kcalRest.length,
      KCAL_INSIGHT_MIN_DAYS,
    );
    if (
      remaining !== null &&
      kcalWorkout.length >= KCAL_INSIGHT_MIN_PER_GROUP &&
      kcalRest.length >= KCAL_INSIGHT_MIN_PER_GROUP
    ) {
      candidates.push({ kind: "approach", target, value: remaining });
    }
  }

  return pickRarest(candidates);
}
