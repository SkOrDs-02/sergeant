/**
 * Геометрія лінії hero «Витрати сьогодні» (redesign v3): накопичені витрати
 * дня від 06:00 до 23:00 проти пунктиру плану дня. Чиста функція, щоб
 * межі вікна й масштаб перевірялись без DOM.
 *
 * Last validated: 2026-10-09
 * Status: Active
 */

export const LINE_W = 350;
export const LINE_H = 56;
/** 06:00 і 23:00 у хвилинах від початку доби. */
export const DAY_FROM = 6 * 60;
export const DAY_TO = 23 * 60;
const TOP = 6;
const BOTTOM = LINE_H - 2;

export interface SpendLine {
  /** Ступінчаста лінія накопичених витрат до «зараз». */
  path: string;
  /** Точка «зараз» на лінії. */
  now: { x: number; y: number };
  /** Висота пунктиру плану, `null` без плану. */
  planY: number | null;
}

const x = (minute: number) =>
  ((Math.min(DAY_TO, Math.max(DAY_FROM, minute)) - DAY_FROM) /
    (DAY_TO - DAY_FROM)) *
  LINE_W;

/**
 * @param points `[хвилина від початку доби, сума]` у порядку часу.
 * @param nowMinute хвилина «зараз»; витрати до 06:00 лягають у старт лінії.
 */
export function buildSpendLine(
  points: ReadonlyArray<readonly [number, number]>,
  nowMinute: number,
  dayPlan: number | null,
): SpendLine {
  const total = points.reduce((s, [, a]) => s + a, 0);
  // ponytail: масштаб від більшого з плану й факту, щоб перевищення не
  // вилітало за верх; без обох лінія лежить на дні.
  const max = Math.max(dayPlan ?? 0, total) * 1.05 || 1;
  const y = (v: number) => BOTTOM - (v / max) * (BOTTOM - TOP);

  let sum = 0;
  let d = `M0 ${y(0).toFixed(1)}`;
  for (const [minute, amount] of points) {
    if (minute > nowMinute) break;
    sum += amount;
    d += ` H${x(minute).toFixed(1)} V${y(sum).toFixed(1)}`;
  }
  const nowX = x(nowMinute);
  d += ` H${nowX.toFixed(1)}`;

  return {
    path: d,
    now: { x: nowX, y: y(sum) },
    planY: dayPlan && dayPlan > 0 ? y(dayPlan) : null,
  };
}
