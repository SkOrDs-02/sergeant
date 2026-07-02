import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import {
  buildDailySeries,
  computePairwiseCorrelations,
  type DailyMetric,
  type DailySeries,
} from "../lib/chatActions/crossActions/dailySeries";

/**
 * Крос-модульні кореляції для weekly-digest → пам'ять коуча (WP3).
 *
 * Рахуємо КОДОМ (не LLM) фіксований набір змістовних пар за 60 днів, переюзаючи
 * той самий обчислювальний примітив, що й chat-тул `get_daily_series`
 * (`buildDailySeries` + `computePairwiseCorrelations`). Повертаємо ≤3
 * людські one-liner-и лише для статистично помітних пар — коуч потім вставляє
 * їх у промпт без жодного додаткового виклику моделі.
 *
 * Anti-scope: це НЕ агентизує коуча. Коуч лишається single-shot без tool-use;
 * ми лише даємо йому якісніший snapshot.
 */

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 60;
const NOTABLE_R = 0.4;
const MIN_N = 5;
const MAX_LINES = 3;

interface PairPhrase {
  a: DailyMetric;
  b: DailyMetric;
  pos: string;
  neg: string;
}

// Курований набір пар, де зв'язок має продуктовий сенс. Порядок метрик у
// `METRICS` нижче не має значення — пара шукається в обох напрямках.
const PAIRS: readonly PairPhrase[] = [
  {
    a: "workout_volume",
    b: "spending",
    pos: "у дні тренувань ти витрачаєш більше",
    neg: "у дні тренувань ти витрачаєш менше",
  },
  {
    a: "habit_rate",
    b: "kcal",
    pos: "коли тримаєш звички — їси більше",
    neg: "коли тримаєш звички — їси менше",
  },
  {
    a: "protein",
    b: "workout_volume",
    pos: "більше білка збігається з більшим об'ємом тренувань",
    neg: "більше білка збігається з меншим об'ємом тренувань",
  },
  {
    a: "weight",
    b: "kcal",
    pos: "вага росте разом із калоріями",
    neg: "вага знижується попри вищі калорії",
  },
];

const METRICS: DailyMetric[] = [
  "spending",
  "kcal",
  "protein",
  "workout_volume",
  "weight",
  "habit_rate",
];

/**
 * Чиста частина: з уже побудованих рядів дістає до 3 one-liner-ів про помітні
 * пари, відсортовані за |r|. Виокремлено для юніт-тестів (не залежить від
 * storage/годинника).
 */
export function correlationsFromSeries(series: DailySeries): string[] {
  const byPair = new Map(
    computePairwiseCorrelations(series).map((c) => [`${c.a}|${c.b}`, c]),
  );

  const found: Array<{ text: string; abs: number }> = [];
  for (const p of PAIRS) {
    const c = byPair.get(`${p.a}|${p.b}`) ?? byPair.get(`${p.b}|${p.a}`);
    if (!c || c.n < MIN_N || !Number.isFinite(c.pearson)) continue;
    if (Math.abs(c.pearson) < NOTABLE_R) continue;
    const phrase = c.pearson > 0 ? p.pos : p.neg;
    found.push({
      text: `${phrase} (r=${c.pearson.toFixed(2)}, ${c.n} дн)`,
      abs: Math.abs(c.pearson),
    });
  }

  return found
    .sort((x, y) => y.abs - x.abs)
    .slice(0, MAX_LINES)
    .map((f) => f.text);
}

/**
 * Повертає до 3 one-liner-ів про помітні крос-модульні зв'язки за останні 60
 * днів, відсортовані за |r|. Порожній масив, якщо нічого не набралося.
 */
export function buildDigestCorrelations(now: number = Date.now()): string[] {
  const to = getKyivDayKey(now);
  const from = getKyivDayKey(now - (WINDOW_DAYS - 1) * DAY_MS);
  return correlationsFromSeries(buildDailySeries(METRICS, { from, to }));
}
