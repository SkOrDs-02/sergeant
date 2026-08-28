/**
 * Last validated: 2026-08-28
 * Status: Active
 *
 * Sergeant Design System — Chart Math
 *
 * Чисті математичні хелпери для рукописних SVG-чартів (без React і без
 * DOM): лінійна шкала домен→піксель, extent серії та білдери path/points
 * рядків. До цього кожен чарт (WeeklyVolumeChart, ExerciseProgressChart,
 * NetworthChart, MiniLineChart, WellbeingChart) виводив min/max/range і
 * клеїв `M/L`-рядки власноруч — байт-у-байт однаковим кодом.
 *
 * AI-DANGER: піксельний паритет. Кожна формула тут навмисно повторює
 * порядок обчислень оригінальних чартів аж до float-точності та формату
 * рядка (`toFixed(1)` для `<path d>`, сирі float-и для `<polyline
 * points>`). Змінюєш формулу чи округлення — звіряй вихідні рядки з
 * golden-тестами в `chartMath.test.ts`, інакше «рефакторинг» зрушить
 * пікселі всіх чартів одразу.
 */

/** Точка в координатах viewBox. */
export interface ChartPoint {
  x: number;
  y: number;
}

/** Мін/макс/діапазон серії значень. */
export interface SeriesExtent {
  min: number;
  max: number;
  /** `max - min`, деґенерований (плоска серія) діапазон замінюється на 1. */
  range: number;
}

/**
 * Extent серії: min, max і захищений від ділення на нуль range.
 *
 * Крайні випадки — як у чартах-попередниках:
 * - плоска серія (усі значення рівні) → `range = 1`, лінія лягає на низ
 *   шкали (`(v - min) / 1 = 0`);
 * - порожній масив → `min = Infinity`, `max = -Infinity` (семантика
 *   `Math.min()`/`Math.max()` без аргументів). Кличі гарантують
 *   непорожність guard-ами «замало точок» ДО обчислення шкали.
 */
export function seriesExtent(values: readonly number[]): SeriesExtent {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, range: max - min || 1 };
}

/**
 * Крок по X між сусідніми точками: `innerW / (n - 1)`.
 * Деґенерація: одна точка → крок дорівнює всій ширині (`n - 1 || 1`),
 * точка стає на лівий край без `NaN`/`Infinity`. Для `n = 0` формула
 * дає `-innerW` (як і в чартах-попередниках) — порожня серія
 * відсікається guard-ами «замало точок» ще до шкали.
 */
export function pointStep(innerW: number, n: number): number {
  return innerW / (n - 1 || 1);
}

/** X-координата i-ї точки при фіксованому кроці: `padL + i * step`. */
export function xAt(padL: number, index: number, step: number): number {
  return padL + index * step;
}

/**
 * X-координата i-ї точки через частку `i / (n - 1)` (варіант
 * NetworthChart). Математично те саме, що `xAt(padL, i, pointStep(...))`,
 * але float-порядок інший — а NetworthChart пише сирі float-и в
 * `<polyline points>`, тож формулу збережено дослівно заради байтового
 * паритету. Кличі гарантують `count >= 2`.
 */
export function fractionX(
  padL: number,
  index: number,
  count: number,
  innerW: number,
): number {
  return padL + (index / (count - 1)) * innerW;
}

/**
 * Лінійна шкала значення → Y-координата viewBox: більше значення — вище
 * (менший y). Формула-канон усіх лінійних чартів:
 * `padT + innerH - ((value - min) / range) * innerH`.
 *
 * `min`/`range` беруться з `seriesExtent` (або задаються доменом явно,
 * напр. `linearY(score, 1, MAX_SCORE - 1, …)` для шкали оцінок 1–5).
 * Клемпінг значення в домен — відповідальність клича (`clampToDomain`),
 * бо чарти клемплять по-різному (WeeklyVolume — лише зверху).
 */
export function linearY(
  value: number,
  min: number,
  range: number,
  padT: number,
  innerH: number,
): number {
  return padT + innerH - ((value - min) / range) * innerH;
}

/**
 * Лінійна довжина (висота бара, span) без інверсії осі:
 * `((value - min) / range) * size`. Використовує WellbeingChart для
 * висот барів енергії/настрою.
 */
export function linearSpan(
  value: number,
  min: number,
  range: number,
  size: number,
): number {
  return ((value - min) / range) * size;
}

/**
 * Клемп значення в домен `[min, max]` — для goal-ліній, щоб ціль поза
 * діапазоном серії лягала на край шкали, а не за межі viewBox.
 */
export function clampToDomain(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * `M/L`-полілінія для `<path d>`: координати з точністю до 1 знака —
 * байт-у-байт формат ручних білдерів WeeklyVolume/ExerciseProgress/
 * MiniLine. Порожній масив → порожній рядок.
 */
export function buildLinePath(points: readonly ChartPoint[]): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
}

/**
 * Замкнений area-шлях: лінія + спуск до базової лінії під останньою
 * точкою + повернення під першу + `Z`. Деґенерація: порожній масив →
 * fallback на `buildLinePath` (тобто порожній рядок), як у
 * WeeklyVolumeChart.
 */
export function buildAreaPath(
  points: readonly ChartPoint[],
  baselineY: number,
): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return buildLinePath(points);
  return `${buildLinePath(points)} L ${last.x.toFixed(1)} ${baselineY.toFixed(1)} L ${first.x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
}

/**
 * Рядок для `<polyline points>`: пари `x,y` СИРИМИ float-ами (без
 * округлення) — формат NetworthChart. Не змішувати з `buildLinePath`:
 * округлення тут зрушило б пікселі.
 */
export function buildPolylinePoints(points: readonly ChartPoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

/**
 * Рядок для area-`<polygon points>`: базова точка під першою → всі точки
 * серії → базова під останньою (сирі float-и, формат NetworthChart).
 * Порожній масив → порожній рядок (кличі гарантують `length >= 2`).
 */
export function buildAreaPolygonPoints(
  points: readonly ChartPoint[],
  baselineY: number,
): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return "";
  return [
    `${first.x},${baselineY}`,
    ...points.map((p) => `${p.x},${p.y}`),
    `${last.x},${baselineY}`,
  ].join(" ");
}
