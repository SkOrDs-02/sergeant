/**
 * Виміряний TDEE з фактичного енергобалансу.
 *
 * Чистий домен: вхід уже має day-key, жодних Date.now/DOM/storage.
 */

/** Емпірична енергія зміни 1 кг маси тіла (вода і глікоген включені). */
export const KCAL_PER_KG = 7700;
/**
 * Півперіод EMA, яким тренд ваги рахувався ДО logic-05. Сам тренд тепер
 * береться з лінійної регресії (див. `weightTrendEma`), і константа в
 * розрахунку не бере участі; лишена, бо це частина публічного експорту
 * пакета.
 */
export const WEIGHT_EMA_HALF_LIFE_DAYS = 7;
export const MIN_COMPLETE_DAYS = 10;
export const MIN_WEIGHT_POINTS = 4;
export const MAX_WEEKLY_GOAL_DELTA_RATIO = 0.1;

/**
 * Частка чинної цілі, від якої день вважається повно залогованим.
 *
 * Раніше повнота міряласьa кількістю прийомів (`mealCount >= 3`), і це
 * промахувалось В ОБИДВА боки:
 *
 *   - три перекуси по 100 ккал давали «повний день» на 300 ккал. Занижене
 *     споживання занижує TDEE, занижений TDEE ріже ціль — рівно та
 *     спіраль, проти якої ворота й ставили;
 *   - хто їсть двічі на добу (інтервальне голодування, OMAD), НІКОЛИ не
 *     набирав 10 повних днів, тож фіча для нього просто не вмикалась.
 *     Лічильник прийомів вимірює не повноту логу, а харчову звичку.
 *
 * Частка від власної цілі людини вільна від обох: один прийом на 2000 ккал
 * — це повний день, а три перекуси на 300 — ні.
 *
 * 0.6 — навмисно низько. Ворота мусять відсіювати ЯВНО недолог, а не
 * судити дні дефіциту: людина на дієті цілком може з'їсти 70% цілі, і це
 * чесний повний день, який алгоритм зобовʼязаний побачити.
 *
 * ЦЕ ПРОКСІ, а не контракт канону §5.2. Канон каже «неповний день
 * позначається», тобто позначку ставить ЛЮДИНА; такого прапорця в моделі
 * немає, і доки його немає, будь-яка автоматика тут — здогадка. Заводити
 * прапорець — окрема продуктова робота, не рефакторинг.
 */
export const MIN_LOGGED_GOAL_SHARE = 0.6;

/**
 * Чи можна вважати день повно залогованим.
 *
 * `goalKcal` — чинна ціль людини; коли її ще немає (перший запуск до
 * сіду), падаємо на лічильник прийомів: краще груба евристика, ніж
 * жодної.
 *
 * `mealOccasions` — саме ПРИЙОМИ, не рядки журналу. Фото, збережене
 * кількома рядками одного прийому, не є кількома прийомами; на боці web
 * це `DaySummary.loggedMealTypesCount`, і його докстрінг прямо забороняє
 * брати сюди `mealCount`.
 */
export function isDayFullyLogged(
  kcal: number,
  mealOccasions: number,
  goalKcal: number | null,
): boolean {
  if (!Number.isFinite(kcal) || kcal <= 0) return false;
  if (goalKcal == null || !Number.isFinite(goalKcal) || goalKcal <= 0) {
    return mealOccasions >= 3;
  }
  return kcal >= goalKcal * MIN_LOGGED_GOAL_SHARE;
}

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

/**
 * Тренд ваги за вікно: нахил лінійної регресії (найменші квадрати) за днями.
 *
 * Назва історична (`Ema`): до logic-05 тут була EMA з півперіодом 7 днів,
 * але `startKg` брався СИРИМ першим заміром, а `endKg` ЗГЛАДЖЕНИМ. На
 * 14-денному вікні EMA відстає від реальної ваги приблизно на половину
 * зміни, тож `deltaKg` виходила вдвічі заниженою: схуднення на 0,1 кг/день
 * давало TDEE ≈2358 замість 2770, а випадковий «водяний» перший замір
 * роздував його на 300+ ккал. Автоматика щотижня зсувала ціль на цю
 * похибку, без участі людини.
 *
 * Регресія порівнює однаково оброблені точки: усі заміри входять одним
 * фітом, лага немає, а один аномальний замір розмазується по 13 днях
 * нахилу замість того, щоб зсунути весь старт. Це лишається «трендом ваги,
 * а не сирою вагою» зі спеки; відкинуте просте порівняння перший-проти-
 * останнього саме тому, що воно віддає весь шум двом крайнім точкам.
 *
 * `deltaKg = нахил × spanDays`; `startKg`/`endKg` — значення регресійної
 * лінії на першому й останньому днях, тож `endKg - startKg === deltaKg`.
 */
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

  const firstDay = clean[0]!.day;
  const spanDays = clean[clean.length - 1]!.day - firstDay;
  if (spanDays <= 0) return null;

  // x — дні від першого заміру: так суми лишаються малими й без втрати точності.
  const n = clean.length;
  const meanX = clean.reduce((sum, p) => sum + (p.day - firstDay), 0) / n;
  const meanY = clean.reduce((sum, p) => sum + p.weightKg, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const point of clean) {
    const dx = point.day - firstDay - meanX;
    sxx += dx * dx;
    sxy += dx * (point.weightKg - meanY);
  }
  // spanDays > 0 гарантує хоча б два різні x, отже sxx > 0.
  const slopeKgPerDay = sxy / sxx;
  const startKg = meanY - slopeKgPerDay * meanX;
  const deltaKg = slopeKgPerDay * spanDays;
  return { startKg, endKg: startKg + deltaKg, deltaKg, spanDays };
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
