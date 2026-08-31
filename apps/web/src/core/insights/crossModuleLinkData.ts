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
 * картка стверджувала б «450 ₴ за день» по одній вибірці днів, а «звʼязок на
 * 12 спостереженнях» — по іншій, і два числа на одній картці описували б різні
 * множини днів. Тут вони описують одну й ту саму.
 *
 * AI-CONTEXT (2026-08-05, друга ітерація): з появою СТРУКТУРНИХ нулів
 * (`ABSENCE_MEANS` у `dailySeries.ts`) зміст цього середнього змінився для
 * частини метрик. Там, де відсутність запису означає справжній нуль (витрати,
 * доходи, тренування, відсоток звичок), день без запису тепер входить у ряд
 * нулем, тож середнє — це «за календарний день», а не «за день, коли ти це
 * записував». Там, де відсутність означає «не виміряно» (ккал, білок, вода,
 * вага, самопочуття), день і далі поза розрахунком, і середнє лишається «за
 * день із записом». Одиниці в `uk.crossModuleLink.ts` сформульовані нейтрально
 * саме тому, що на одній картці можуть зустрітись обидва зміст.
 */
import { messages } from "@shared/i18n/uk";
import type {
  DailyMetric,
  DailySeries,
} from "../lib/chatActions/crossActions/dailySeries";
import { CURATED_PAIRS, type NotablePair } from "./digestCorrelations";
import type {
  CrossModuleLinkCardProps,
  CrossModuleLinkDay,
  CrossModuleLinkModule,
  CrossModuleLinkPole,
} from "./CrossModuleLinkCard";
import { formatNumberUk } from "@sergeant/shared";

/**
 * Метрика → модуль, якому вона належить. Тримає module-accent containment:
 * полюс фарбується акцентом СВОГО модуля, тож зіставлення має бути одне на
 * весь продукт, а не вгадуватись на місці рендеру.
 *
 * AI-CONTEXT: `wellbeing` спершу було записано в Рутину — помилково.
 * Самопочуття пишеться і читається зі ЩОДЕННИКА ФІЗРУКА (`readFizrukDaily`
 * у `dailySeries.ts`, запис через `fizrukActions/wellbeing.ts`) — того
 * самого, звідки береться вага. Помилка була не косметична: вона
 * перевертала фільтр `isCrossModule` на двох парах — `habit_rate ×
 * wellbeing` дарма відкидалась як внутрішньомодульна, а `workout_volume ×
 * wellbeing` дарма вважалась крос-модульною.
 *
 * Наслідок, який варто знати: Рутина має рівно ОДНУ метрику —
 * `habit_rate`. Усі її крос-модульні пари йдуть тільки через неї.
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
  wellbeing: "fizruk",
  habit_rate: "routine",
  // Витрати за категорією — Фінік, як і будь-які інші гроші. Саме тому
  // пари «алкоголь × самопочуття/калорії/звички» рахуються крос-модульними
  // (`isCrossModule`), а «алкоголь × spending» — ні, і це правильно: обидва
  // полюси там з одного модуля й одних даних.
  alcohol_spending: "finyk",
  smoking_spending: "finyk",
};

/**
 * Округлення під величину: тисячі гривень з розрядами, дрібні лічильники
 * («1.3 тренування») — з десятковою, бо ціле «1» приховало б різницю між
 * «майже щодня» і «через день».
 */
function formatPoleValue(mean: number): string {
  if (!Number.isFinite(mean)) return "—";
  const abs = Math.abs(mean);
  if (abs >= 10) return formatNumberUk(Math.round(mean));
  return formatNumberUk(Math.round(mean * 10) / 10);
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

/**
 * Ті самі спільні дні, але поштучно — для розгортання доказової смуги.
 * Найновіші перші: остання картина цікавіша за позаминулий місяць.
 *
 * Формат значень той самий, що й на полюсах (`formatPoleValue`), щоб число
 * в списку не суперечило числу над ним.
 */
export function pairwiseDays(
  series: DailySeries,
  a: DailyMetric,
  b: DailyMetric,
): CrossModuleLinkDay[] {
  const colA = series.raw[a];
  const colB = series.raw[b];
  if (!colA || !colB) return [];

  const out: CrossModuleLinkDay[] = [];
  const len = Math.min(colA.length, colB.length, series.days.length);
  for (let i = 0; i < len; i += 1) {
    const va = colA[i];
    const vb = colB[i];
    const key = series.days[i];
    if (key === undefined || va === undefined || vb === undefined) continue;
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    out.push({
      key,
      valueA: formatPoleValue(va),
      valueB: formatPoleValue(vb),
    });
  }
  return out.reverse();
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
 * пара там — `workout_volume × wellbeing` — обидві половини має у Фізруку
 * (`wellbeing` належить фізруковому щоденнику — див. `METRIC_MODULE` вище).
 * Рядку дайджесту це не шкодить («після важчих тренувань почуваєшся краще» —
 * коректне спостереження), але картка КРОС-модульного звʼязку намалювала б
 * «Фізрук × Фізрук», тобто збрехала б формою. Тому фільтр тут, а не в
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
    days: pairwiseDays(series, pair.a, pair.b),
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
