/**
 * Last validated: 2026-08-05
 * Status: Active
 *
 * Міст між статистикою (`digestCorrelations` → `NotablePair`) і формою
 * (`CrossModuleLinkCard` → дві осі). Перетворює пару метрик на пару полюсів
 * із модулем, числом і одиницею.
 *
 * AI-CONTEXT: середнє рахується НЕ по всьому вікну, а рівно по тих спільних
 * днях, на яких порахований `r` (pairwise-complete). Це навмисно: інакше
 * картка стверджувала б «450 ₴ за день» по одній вибірці днів, а «зв'язок на
 * 12 спостереженнях» — по іншій, і два числа на одній картці описували б різні
 * множини днів. Тут вони описують одну й ту саму.
 *
 * Днів без запису в ряді немає взагалі (`readMetric` не пише нулі за дні без
 * даних), тож середнє — це «скільки в типовий день, коли ти це записував», а
 * не «скільки в середньому за календарний день». Одиниці в
 * `uk.crossModuleLink.ts` сформульовані саме так.
 */
import { messages } from "@shared/i18n/uk";
import type {
  DailyMetric,
  DailySeries,
} from "../lib/chatActions/crossActions/dailySeries";
import { CURATED_PAIRS, type NotablePair } from "./digestCorrelations";
import type {
  CrossModuleLinkCardProps,
  CrossModuleLinkModule,
  CrossModuleLinkPole,
} from "./CrossModuleLinkCard";

/**
 * Метрика → модуль, якому вона належить. Тримає module-accent containment:
 * полюс фарбується акцентом СВОГО модуля, тож зіставлення має бути одне на
 * весь продукт, а не вгадуватись на місці рендеру.
 */
const METRIC_MODULE: Record<DailyMetric, CrossModuleLinkModule> = {
  spending: "finyk",
  income: "finyk",
  kcal: "nutrition",
  protein: "nutrition",
  water: "nutrition",
  workout_volume: "fizruk",
  workouts: "fizruk",
  weight: "fizruk",
  wellbeing: "routine",
  habit_rate: "routine",
};

/**
 * Округлення під величину: тисячі гривень з розрядами, дрібні лічильники
 * («1.3 тренування») — з десятковою, бо ціле «1» приховало б різницю між
 * «майже щодня» і «через день».
 */
function formatPoleValue(mean: number): string {
  if (!Number.isFinite(mean)) return "—";
  const abs = Math.abs(mean);
  if (abs >= 10) return Math.round(mean).toLocaleString("uk-UA");
  return (Math.round(mean * 10) / 10).toLocaleString("uk-UA");
}

/**
 * Середні обох метрик по спільних днях. Повертає `null`, якщо спільних днів
 * немає — тоді картка для цієї пари просто не будується.
 */
export function pairwiseMeans(
  series: DailySeries,
  a: DailyMetric,
  b: DailyMetric,
): { meanA: number; meanB: number; n: number } | null {
  const colA = series.raw[a];
  const colB = series.raw[b];
  if (!colA || !colB) return null;

  let sumA = 0;
  let sumB = 0;
  let n = 0;
  const len = Math.min(colA.length, colB.length);
  for (let i = 0; i < len; i += 1) {
    const va = colA[i];
    const vb = colB[i];
    if (va === undefined || vb === undefined) continue;
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    sumA += va;
    sumB += vb;
    n += 1;
  }
  if (n === 0) return null;
  return { meanA: sumA / n, meanB: sumB / n, n };
}

/**
 * Фрази в `PAIRS` написані як продовження рядка дайджесту («у дні
 * тренувань…»), тож із малої. На картці це самостійне речення — велика
 * літера. Джерело копії лишається одне, розходження формулювань немає.
 */
function capitalizeFirst(text: string): string {
  const first = text.slice(0, 1);
  return first ? first.toUpperCase() + text.slice(1) : text;
}

function pole(metric: DailyMetric, mean: number): CrossModuleLinkPole {
  const module = METRIC_MODULE[metric];
  return {
    module,
    label: messages.crossModuleLink.moduleLabel[module],
    value: formatPoleValue(mean),
    unit: messages.crossModuleLink.metricUnit[metric],
  };
}

/** Чи справді пара перетинає межу модулів. */
export function isCrossModule(a: DailyMetric, b: DailyMetric): boolean {
  return METRIC_MODULE[a] !== METRIC_MODULE[b];
}

/**
 * Одна помітна пара → пропси картки. `null`, якщо спільних днів не лишилось
 * АБО пара насправді всередині одного модуля.
 *
 * AI-CONTEXT: курований набір `PAIRS` зібраний для дайджест-рядків, і одна
 * пара там — `habit_rate × wellbeing` — обидві половини має в Рутині. Рядку
 * дайджесту це не шкодить («коли тримаєш звички — почуваєшся краще» —
 * коректне спостереження), але картка КРОС-модульного зв'язку намалювала б
 * «Рутина × Рутина», тобто збрехала б формою. Тому фільтр тут, а не в
 * `digestCorrelations`: там пара легітимна.
 */
export function linkFromPair(
  series: DailySeries,
  pair: NotablePair,
): CrossModuleLinkCardProps | null {
  if (!isCrossModule(pair.a, pair.b)) return null;
  const means = pairwiseMeans(series, pair.a, pair.b);
  if (!means) return null;
  return {
    poleA: pole(pair.a, means.meanA),
    poleB: pole(pair.b, means.meanB),
    observations: pair.n,
    strength: pair.pearson,
    phrase: capitalizeFirst(pair.phrase),
  };
}

/**
 * Крос-модульна пара, яка НАЙБЛИЖЧЕ до того, щоб заговорити — найбільше
 * спільних днів серед курованих. Потрібна станові мовчання: він показує
 * реальні полюси й реальний прогрес до порога, а не нуль і не вигаданий
 * приклад.
 *
 * Якщо спільних днів немає взагалі (порожній застосунок), повертає першу
 * крос-модульну пару з набору і `n = 0` — це чесна відповідь «ось що я шукаю,
 * поки не бачив жодного спільного дня».
 */
export function closestCrossModulePair(series: DailySeries): {
  a: DailyMetric;
  b: DailyMetric;
  n: number;
} | null {
  let best: { a: DailyMetric; b: DailyMetric; n: number } | null = null;
  for (const p of CURATED_PAIRS) {
    if (!isCrossModule(p.a, p.b)) continue;
    const n = pairwiseMeans(series, p.a, p.b)?.n ?? 0;
    if (best === null || n > best.n) best = { a: p.a, b: p.b, n };
  }
  return best;
}

/** Полюси для стану мовчання — без чисел, лише модулі. */
export function silentPoles(
  a: DailyMetric,
  b: DailyMetric,
): { poleA: CrossModuleLinkPole; poleB: CrossModuleLinkPole } {
  return { poleA: pole(a, Number.NaN), poleB: pole(b, Number.NaN) };
}
