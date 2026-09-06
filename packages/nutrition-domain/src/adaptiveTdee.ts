/**
 * Виміряний TDEE з фактичного енергобалансу.
 *
 * Чистий домен: вхід уже має day-key, жодних Date.now/DOM/storage.
 */

/** Емпірична енергія зміни 1 кг маси тіла (вода і глікоген включені). */
export const KCAL_PER_KG = 7700;
export const WEIGHT_EMA_HALF_LIFE_DAYS = 7;
export const MIN_COMPLETE_DAYS = 10;
export const MIN_WEIGHT_POINTS = 4;
export const MAX_WEEKLY_GOAL_DELTA_RATIO = 0.1;

export interface WeightPoint {
  dateKey: string;
  weightKg: number;
}

export interface IntakeDay {
  dateKey: string;
  kcal: number;
  complete: boolean;
}

export interface WeightTrend {
  startKg: number;
  endKg: number;
  deltaKg: number;
  spanDays: number;
}

export interface MeasuredTdeeResult {
  averageIntakeKcal: number;
  weightDeltaKg: number;
  days: number;
  tdeeKcal: number;
  completeDays: number;
  weightPoints: number;
}

export function measuredTdeeFromBalance(
  averageIntakeKcal: number,
  weightDeltaKg: number,
  days: number,
): number | null {
  if (
    !Number.isFinite(averageIntakeKcal) ||
    averageIntakeKcal <= 0 ||
    !Number.isFinite(weightDeltaKg) ||
    !Number.isFinite(days) ||
    days <= 0
  ) {
    return null;
  }
  const tdeeKcal = averageIntakeKcal - (weightDeltaKg * KCAL_PER_KG) / days;
  return Number.isFinite(tdeeKcal) && tdeeKcal > 0
    ? Math.round(tdeeKcal)
    : null;
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(key: string): number | null {
  if (!DAY_KEY_RE.test(key)) return null;
  const [year, month, day] = key.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const value = Date.UTC(year, month - 1, day) / 86_400_000;
  return Number.isFinite(value) ? value : null;
}

export function weightTrendEma(
  points: readonly WeightPoint[],
): WeightTrend | null {
  const clean = points
    .map((point) => ({ ...point, day: dayNumber(point.dateKey) }))
    .filter(
      (point): point is WeightPoint & { day: number } =>
        point.day !== null &&
        Number.isFinite(point.weightKg) &&
        point.weightKg > 0,
    )
    .sort((a, b) => a.day - b.day);
  if (clean.length < 2) return null;

  let ema = clean[0]!.weightKg;
  const startKg = ema;
  let previousDay = clean[0]!.day;
  for (const point of clean.slice(1)) {
    const elapsed = Math.max(1, point.day - previousDay);
    const alpha = 1 - Math.pow(0.5, elapsed / WEIGHT_EMA_HALF_LIFE_DAYS);
    ema += alpha * (point.weightKg - ema);
    previousDay = point.day;
  }
  const spanDays = clean[clean.length - 1]!.day - clean[0]!.day;
  if (spanDays <= 0) return null;
  return { startKg, endKg: ema, deltaKg: ema - startKg, spanDays };
}

export function measuredTdee(
  intakeDays: readonly IntakeDay[],
  weights: readonly WeightPoint[],
): MeasuredTdeeResult | null {
  const complete = intakeDays.filter(
    (day) =>
      day.complete &&
      dayNumber(day.dateKey) !== null &&
      Number.isFinite(day.kcal) &&
      day.kcal > 0,
  );
  const cleanWeights = weights.filter(
    (point) =>
      dayNumber(point.dateKey) !== null &&
      Number.isFinite(point.weightKg) &&
      point.weightKg > 0,
  );
  if (
    complete.length < MIN_COMPLETE_DAYS ||
    cleanWeights.length < MIN_WEIGHT_POINTS
  ) {
    return null;
  }
  const trend = weightTrendEma(cleanWeights);
  if (!trend) return null;
  const averageIntakeKcal =
    complete.reduce((sum, day) => sum + day.kcal, 0) / complete.length;
  const tdeeKcal = measuredTdeeFromBalance(
    averageIntakeKcal,
    trend.deltaKg,
    trend.spanDays,
  );
  if (tdeeKcal === null) return null;
  return {
    averageIntakeKcal: Math.round(averageIntakeKcal),
    weightDeltaKg: trend.deltaKg,
    days: trend.spanDays,
    tdeeKcal,
    completeDays: complete.length,
    weightPoints: cleanWeights.length,
  };
}

export function clampGoalDelta(
  proposedKcal: number,
  currentKcal: number,
  bmrKcal: number,
): number {
  const safeCurrent = Math.max(1, currentKcal);
  const lower = Math.max(
    bmrKcal,
    safeCurrent * (1 - MAX_WEEKLY_GOAL_DELTA_RATIO),
  );
  const upper = safeCurrent * (1 + MAX_WEEKLY_GOAL_DELTA_RATIO);
  return Math.round(Math.min(upper, Math.max(lower, proposedKcal)));
}
