/* eslint-disable sergeant-design/no-raw-storage-key --
   Cross-module daily-series reader (outside React): tx splits stay on LS;
   bank transactions now come from the Mono mirror reader (Dual-write
   teardown Phase 3). */
/**
 * `get_daily_series` — вирівняні по днях ряди метрик з усіх 4 модулів +
 * пораховані КОДОМ кореляції (Pearson/Spearman) для кожної пари. Це базовий
 * примітив для «чи повʼязано X з Y»: раніше модель мусила зіставляти агрегати
 * різної форми з кількох query-тулів «в умі», що ненадійно.
 *
 * Усі читання йдуть ЛИШЕ через доменні storage-обгортки (не сирі LS-ключі, крім
 * `finyk_tx_cache`/`finyk_tx_splits`, які не мають SQLite-канону). День — завжди
 * `Europe/Kyiv` (`getKyivDayKey`). Гроші (finyk) віддаються у гривнях —
 * `getTxStatAmount` вже ділить копійки на 100.
 *
 * `buildDailySeries` та `computePairwiseCorrelations` — чисті й експортовані
 * навмисно: WP3 (кореляції у weekly digest → памʼять коуча) переюзає той самий
 * обчислювальний код замість дублювання статистики.
 */
import {
  buildFinykSpendingUniverse,
  calcCategorySpent,
} from "@sergeant/finyk-domain";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { ls } from "../../hubChatUtils";
import { getTxStatAmount } from "../../../../modules/finyk/utils";
import { getCachedFinykSqliteState } from "../../../../modules/finyk/lib/sqliteReader";
import { getVisibleFinykMonoMirrorState } from "../../../../modules/finyk/lib/monoMirrorReader";
import { loadNutritionLog } from "../../../../modules/nutrition/lib/nutritionStorage";
import { getCachedNutritionSqliteState } from "../../../../modules/nutrition/lib/sqliteReader";
import { loadRoutineState } from "../../../../modules/routine/lib/routineStorage";
import {
  readFizrukWorkouts,
  readFizrukDailyLog,
} from "../fizrukActions/shared";
import type { GetDailySeriesAction } from "../types";

// ─── Метрики ─────────────────────────────────────────────────────────────────

export const DAILY_SERIES_METRICS = [
  "spending",
  "income",
  "kcal",
  "protein",
  "water",
  "workout_volume",
  "workouts",
  "weight",
  "wellbeing",
  "habit_rate",
  "alcohol_spending",
] as const;

export type DailyMetric = (typeof DAILY_SERIES_METRICS)[number];

const METRIC_UNIT: Record<DailyMetric, string> = {
  spending: "грн",
  income: "грн",
  kcal: "ккал",
  protein: "г",
  water: "мл",
  workout_volume: "кг×повт",
  workouts: "шт",
  weight: "кг",
  wellbeing: "1-5",
  habit_rate: "%",
  alcohol_spending: "грн",
};

// ─── Що означає ВІДСУТНІЙ запис за день ──────────────────────────────────────

/**
 * Порожня клітинка в ряді має два різні змісти, і до 2026-08-05 код їх плутав:
 * усі пропуски були `undefined`, тож кореляція рахувалась лише на днях, де
 * записано ОБИДВІ метрики. Для пари «тренування × звички» це означало вибірку
 * з самих лише днів, коли людина і тренувалась, І виконала звичку, — тобто
 * питання «чи повʼязані вони» ставилось рівно на тих днях, де відповідь уже
 * «так». Систематичне завищення, а не шум.
 *
 * - `unknown` — не виміряно. Не зʼїв 0 ккал і не важив 0 кг — просто не записав.
 *   Такий день має лишитись поза розрахунком.
 * - `zero` — справжній нуль від першого запису метрики й далі. Запис створює
 *   САМА людина всередині застосунку (тренування, відмітка звички), тож день
 *   без запису після першого — це день, коли вона цього не робила.
 * - `zero-while-covered` — справжній нуль, але лише в межах підтвердженого
 *   покриття. Транзакції приходять із ЗОВНІШНЬОГО дзеркала Monobank, і день без
 *   транзакції може означати як «не витрачав», так і «синк відстав». Тому нулі
 *   ставляться лише між першим і ОСТАННІМ побаченим записом — за останній
 *   підтверджений день ми нулі не вигадуємо.
 *
 * AI-DANGER: перенести метрику з `unknown` у `zero` — це змінити зміст усіх
 * кореляцій, у яких вона бере участь, і чисел на полюсах карток звʼязку
 * (середнє стає «за календарний день», а не «за день із записом»). Не роби це
 * без перечитування `crossModuleLinkData.ts` і копії в `uk.crossModuleLink.ts`.
 */
export type AbsenceMeaning = "unknown" | "zero" | "zero-while-covered";

export const ABSENCE_MEANS: Record<DailyMetric, AbsenceMeaning> = {
  spending: "zero-while-covered",
  income: "zero-while-covered",
  kcal: "unknown",
  protein: "unknown",
  water: "unknown",
  workout_volume: "zero",
  workouts: "zero",
  weight: "unknown",
  wellbeing: "unknown",
  habit_rate: "zero",
  // Той самий зміст, що й `spending`: у покритому періоді день без покупки
  // алкоголю — справжній нуль, а не «невідомо».
  //
  // Наслідок, який варто знати: покриття рахується по САМІЙ метриці, тож
  // вікно пар з алкоголем — між першою й останньою його покупкою за 60
  // днів, а не весь період банківського синку. Для того, хто купує його
  // бодай раз на два тижні, це майже все вікно; для того, хто не купує
  // взагалі, метрика мовчить — і це правильніше, ніж константний нуль,
  // який корелював би з будь-чим.
  alcohol_spending: "zero-while-covered",
};

const DAY_MS = 86_400_000;
const DEFAULT_PERIOD_DAYS = 60;
const MAX_PERIOD_DAYS = 365;
const MAX_METRICS = 6;
const MIN_CORRELATION_POINTS = 4;
const MAX_TABLE_ROWS = 90;

// ─── Утиліти діапазону/парсингу ──────────────────────────────────────────────

function isoOrUndef(value: unknown): string | undefined {
  const s = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

/** Inclusive `[from, to]` Kyiv day-key window; explicit dates win over period. */
function resolveRange(
  dateFrom: unknown,
  dateTo: unknown,
  periodDays: unknown,
): { from: string; to: string } {
  const to = isoOrUndef(dateTo) ?? getKyivDayKey();
  const explicitFrom = isoOrUndef(dateFrom);
  if (explicitFrom) return { from: explicitFrom, to };
  const raw = Number(periodDays);
  const days =
    Number.isFinite(raw) && raw > 0
      ? Math.min(MAX_PERIOD_DAYS, Math.floor(raw))
      : DEFAULT_PERIOD_DAYS;
  const toMs = Date.parse(`${to}T12:00:00Z`);
  const from = getKyivDayKey(toMs - (days - 1) * DAY_MS);
  return { from, to };
}

/** Ordered inclusive list of Kyiv day-keys in `[from, to]` (noon-UTC step). */
function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(cur) || !Number.isFinite(end) || cur > end) return out;
  let guard = 0;
  while (cur <= end && guard <= MAX_PERIOD_DAYS) {
    out.push(getKyivDayKey(cur));
    cur += DAY_MS;
    guard++;
  }
  return out;
}

function addTo(map: Map<string, number>, day: string, amount: number): void {
  map.set(day, (map.get(day) ?? 0) + amount);
}

// ─── Читачі метрик → Map<dayKey, value> (лише дні з реальними даними) ─────────

/**
 * Видимі транзакції + спліти — спільна основа для `readFinyk` і
 * `readFinykCategory`. Обидва читачі раніше самі кликали
 * `buildFinykSpendingUniverse` і самі парсили `finyk_tx_splits`, тож пара
 * `spending × alcohol_spending` в одному вікні робила цю роботу двічі.
 */
function loadFinykSpending(): {
  txs: Array<{ id: string; amount: number; time?: number }>;
  splits: Record<string, unknown>;
} {
  const cached = getCachedFinykSqliteState();
  const all = buildFinykSpendingUniverse({
    bankTxs: getVisibleFinykMonoMirrorState().transactions,
    manualExpenses: cached.manualExpenses,
  }).transactions as Array<{ id: string; amount: number; time?: number }>;
  const hidden = cached.hiddenTransactions;
  return {
    txs: all.filter((t) => !hidden.includes(t.id || "")),
    splits: ls<Record<string, unknown>>("finyk_tx_splits", {}),
  };
}

function readFinyk(sign: "spending" | "income"): Map<string, number> {
  const out = new Map<string, number>();
  // Всесвіт витрат — банк + РУЧНІ записи, як вимагає канон finyk §5
  // («банк і ручний світ рівні»). До 2026-08-07 тут читалось лише
  // Mono-дзеркало, і для тестера без Monobank метрики spending/income
  // були порожні назавжди — жодна курована пара з Фініком не могла
  // заговорити (знахідка F7 репетиції бета-прогону,
  // docs/90-work/audits/2026-08-07-beta-rehearsal-run.md).
  const { txs, splits } = loadFinykSpending();
  for (const t of txs) {
    if (!t.time) continue;
    if (sign === "spending" && t.amount < 0) {
      addTo(out, getKyivDayKey(t.time * 1000), getTxStatAmount(t, splits));
    } else if (sign === "income" && t.amount > 0) {
      addTo(out, getKyivDayKey(t.time * 1000), t.amount / 100);
    }
  }
  return out;
}

/**
 * Денні витрати за ОДНІЄЮ категорією — новий клас метрики, що виріс із
 * чекового спліту (Silpo трек F).
 *
 * AI-CONTEXT: до чек-скану алкоголь тонув у `groceries` — одна покупка в
 * супермаркеті була неподільним рядком, і питання «чи повʼязані вечері з
 * вином і ранковим самопочуттям» не можна було поставити навіть у теорії.
 * Спліт за чеком розділив рядок на категорії, а калібрування 2026-08-25
 * (§4 спеки) завело `alcohol` окремою категорією — тобто дані для такої
 * пари вже накопичуються, просто ніхто їх не читав.
 *
 * `calcCategorySpent` рахує суму за категорією рівно так само, як екран
 * категорій Фініка: спліт має пріоритет над категорією транзакції. Тому
 * тут не власна арифметика, а той самий примітив — інакше картка зв'язку
 * і розбивка витрат розійшлись би в числах на тих самих даних.
 */
function readFinykCategory(categoryId: string): Map<string, number> {
  const out = new Map<string, number>();
  const cached = getCachedFinykSqliteState();
  const { txs, splits } = loadFinykSpending();

  // Групуємо по днях, а суму за категорією рахує `calcCategorySpent` —
  // їй байдуже, скільки транзакцій у масиві.
  const byDay = new Map<string, typeof txs>();
  for (const t of txs) {
    if (!t.time || t.amount >= 0) continue;
    const day = getKyivDayKey(t.time * 1000);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(t);
    else byDay.set(day, [t]);
  }

  for (const [day, dayTxs] of byDay) {
    const spent = calcCategorySpent(
      dayTxs as never,
      categoryId,
      cached.txCategories,
      splits,
      cached.customCategories,
    );
    if (spent > 0) out.set(day, spent);
  }
  return out;
}

function readNutritionMacro(macro: "kcal" | "protein"): Map<string, number> {
  const out = new Map<string, number>();
  const log = loadNutritionLog();
  for (const [day, data] of Object.entries(log)) {
    const meals = data?.meals ?? [];
    let sum = 0;
    for (const m of meals) {
      sum +=
        macro === "kcal" ? (m?.macros?.kcal ?? 0) : (m?.macros?.protein_g ?? 0);
    }
    if (sum > 0) out.set(day, sum);
  }
  return out;
}

function readWater(): Map<string, number> {
  const out = new Map<string, number>();
  const waterLog = getCachedNutritionSqliteState().waterLog;
  for (const [day, ml] of Object.entries(waterLog)) {
    if (typeof ml === "number" && ml > 0) out.set(day, ml);
  }
  return out;
}

function readFizrukWorkoutMetric(
  kind: "workout_volume" | "workouts",
): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of readFizrukWorkouts()) {
    if (!w.endedAt || !w.startedAt) continue;
    const day = getKyivDayKey(new Date(w.startedAt));
    if (kind === "workouts") {
      addTo(out, day, 1);
    } else {
      const volume = (w.items ?? []).reduce(
        (s, item) =>
          s +
          (item.sets ?? []).reduce(
            (ss, set) => ss + (set.weightKg ?? 0) * (set.reps ?? 0),
            0,
          ),
        0,
      );
      if (volume > 0) addTo(out, day, volume);
    }
  }
  return out;
}

function readFizrukDaily(kind: "weight" | "wellbeing"): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of readFizrukDailyLog()) {
    if (!e.at) continue;
    const day = getKyivDayKey(new Date(e.at));
    const value =
      kind === "weight" ? e.weightKg : (e.moodScore ?? e.mood ?? null);
    if (typeof value === "number" && Number.isFinite(value))
      out.set(day, value);
  }
  return out;
}

function readHabitRate(habitId?: string): Map<string, number> {
  const out = new Map<string, number>();
  const state = loadRoutineState();
  const active = state.habits.filter((h) => !h.archived);
  const completions = state.completions ?? {};
  if (habitId) {
    const done = completions[habitId] ?? [];
    for (const day of done) out.set(day, 100);
    return out;
  }
  if (active.length === 0) return out;
  const perDay = new Map<string, number>();
  for (const h of active) {
    for (const day of completions[h.id] ?? []) {
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
  }
  for (const [day, done] of perDay) {
    out.set(day, Math.round((done / active.length) * 100));
  }
  return out;
}

function readMetric(
  metric: DailyMetric,
  habitId?: string,
): Map<string, number> {
  switch (metric) {
    case "spending":
      return readFinyk("spending");
    case "income":
      return readFinyk("income");
    case "kcal":
      return readNutritionMacro("kcal");
    case "protein":
      return readNutritionMacro("protein");
    case "water":
      return readWater();
    case "workout_volume":
      return readFizrukWorkoutMetric("workout_volume");
    case "workouts":
      return readFizrukWorkoutMetric("workouts");
    case "weight":
      return readFizrukDaily("weight");
    case "wellbeing":
      return readFizrukDaily("wellbeing");
    case "habit_rate":
      return readHabitRate(habitId);
    case "alcohol_spending":
      return readFinykCategory("alcohol");
  }
}

// ─── Побудова вирівняних рядів ───────────────────────────────────────────────

export interface DailySeries {
  from: string;
  to: string;
  days: string[];
  /** Значення по днях (`undefined` = день не виміряно; `0` може бути як записом, так і структурним нулем — див. `ABSENCE_MEANS`). */
  raw: Record<string, (number | undefined)[]>;
  metrics: DailyMetric[];
}

/**
 * Проставляє СТРУКТУРНІ нулі — дні, коли метрика справді дорівнює нулю, а не
 * дні, коли її не виміряли (`ABSENCE_MEANS`). Межі покриття беруться з ПОВНОЇ
 * історії метрики, а не з вікна: якщо витрати пишуться пів року, то всі 60 днів
 * вікна всередині покриття, і нуль там — вимірювання, а не здогад. І навпаки,
 * до першого запису модуля нулів не буває — там просто ще нічого не було.
 *
 * `col` мутується на місці: викликається рівно один раз, одразу після
 * заповнення стовпця, поки він ще нічий.
 */
function applyStructuralZeros(
  col: (number | undefined)[],
  days: string[],
  readings: Map<string, number>,
  meaning: AbsenceMeaning,
): void {
  if (meaning === "unknown" || readings.size === 0) return;
  // Ключі дня — `YYYY-MM-DD`, тож лексикографічне порівняння = хронологічне.
  let first: string | undefined;
  let last: string | undefined;
  for (const day of readings.keys()) {
    if (first === undefined || day < first) first = day;
    if (last === undefined || day > last) last = day;
  }
  if (first === undefined || last === undefined) return;
  for (let i = 0; i < col.length; i += 1) {
    if (col[i] !== undefined) continue;
    const day = days[i];
    if (day === undefined || day < first) continue;
    if (meaning === "zero-while-covered" && day > last) continue;
    col[i] = 0;
  }
}

/**
 * Будує вирівняну по днях таблицю. `raw[metric][i]` = значення на `days[i]`,
 * `0` для дня без запису там, де відсутність означає справжній нуль
 * (`ABSENCE_MEANS`), або `undefined`, якщо день просто не виміряний.
 *
 * Кореляції рахуються на `undefined`-aware основі (див.
 * `computePairwiseCorrelations`), тому `fill` у `formatDailySeries` впливає
 * лише на вигляд таблиці, не на статистику. Структурні нулі — навпаки: вони
 * входять У статистику, бо це виміряні значення.
 */
export function buildDailySeries(
  metrics: DailyMetric[],
  opts: { from: string; to: string; habitId?: string },
): DailySeries {
  const days = dayRange(opts.from, opts.to);
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const raw: Record<string, (number | undefined)[]> = {};
  for (const metric of metrics) {
    const col: (number | undefined)[] = new Array(days.length).fill(undefined);
    const readings = readMetric(metric, opts.habitId);
    for (const [day, value] of readings) {
      const i = dayIndex.get(day);
      if (i !== undefined) col[i] = value;
    }
    applyStructuralZeros(col, days, readings, ABSENCE_MEANS[metric]);
    raw[metric] = col;
  }
  return { from: opts.from, to: opts.to, days, raw, metrics };
}

// ─── Кореляції ───────────────────────────────────────────────────────────────

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = (xs[i] as number) - mx;
    const b = (ys[i] as number) - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? NaN : num / den;
}

/** Average-rank transform (ties share the mean rank). */
function rank(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < order.length) {
    const cur = order[i];
    if (!cur) break;
    let j = i;
    while (j + 1 < order.length) {
      const next = order[j + 1];
      if (!next || next.v !== cur.v) break;
      j++;
    }
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      const el = order[k];
      if (el) ranks[el.i] = avg;
    }
    i = j + 1;
  }
  return ranks;
}

function spearman(xs: number[], ys: number[]): number {
  if (xs.length < 2) return NaN;
  return pearson(rank(xs), rank(ys));
}

export interface PairCorrelation {
  a: DailyMetric;
  b: DailyMetric;
  n: number;
  pearson: number;
  spearman: number;
}

/**
 * Для кожної пари метрик рахує Pearson + Spearman на днях, де ОБИДВІ метрики
 * мають реальне значення (pairwise-complete). Пари з < `MIN_CORRELATION_POINTS`
 * спільних точок пропускаються — на малій вибірці кореляція шумова.
 */
export function computePairwiseCorrelations(
  series: DailySeries,
): PairCorrelation[] {
  const out: PairCorrelation[] = [];
  const { metrics, raw } = series;
  for (let i = 0; i < metrics.length; i++) {
    for (let j = i + 1; j < metrics.length; j++) {
      const a = metrics[i] as DailyMetric;
      const b = metrics[j] as DailyMetric;
      const ca = raw[a] ?? [];
      const cb = raw[b] ?? [];
      const xs: number[] = [];
      const ys: number[] = [];
      for (let k = 0; k < ca.length; k++) {
        const va = ca[k];
        const vb = cb[k];
        if (va !== undefined && vb !== undefined) {
          xs.push(va);
          ys.push(vb);
        }
      }
      if (xs.length < MIN_CORRELATION_POINTS) continue;
      out.push({
        a,
        b,
        n: xs.length,
        pearson: pearson(xs, ys),
        spearman: spearman(xs, ys),
      });
    }
  }
  return out;
}

// ─── Форматування ────────────────────────────────────────────────────────────

function strength(r: number): string {
  const abs = Math.abs(r);
  const dir = r > 0 ? "прямий" : "зворотній";
  if (abs >= 0.7) return `сильний ${dir}`;
  if (abs >= 0.4) return `помірний ${dir}`;
  if (abs >= 0.2) return `слабкий ${dir}`;
  return "майже відсутній";
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function summariseMetric(
  metric: DailyMetric,
  col: (number | undefined)[],
): string {
  const present = col.filter((v): v is number => v !== undefined);
  if (present.length === 0) return `${metric}: немає даних`;
  const mean = present.reduce((a, b) => a + b, 0) / present.length;
  const mid = Math.floor(present.length / 2);
  let trend = "";
  if (present.length >= 4) {
    const firstHalf = present.slice(0, mid);
    const secondHalf = present.slice(mid);
    const a = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const b = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
    trend = b > a ? " ↑" : b < a ? " ↓" : " →";
  }
  return `${metric}: середнє ${fmt(mean)} ${METRIC_UNIT[metric]} (${present.length} дн)${trend}`;
}

export function formatDailySeries(
  series: DailySeries,
  correlations: PairCorrelation[],
  fill: "zero" | "null",
): string {
  const { days, metrics, raw } = series;
  const lines: string[] = [
    `Ряди метрик ${series.from} – ${series.to} (${days.length} днів; одиниці: ${metrics
      .map((m) => `${m}=${METRIC_UNIT[m]}`)
      .join(", ")})`,
  ];

  // Кореляції — найважливіше, тому першими.
  if (metrics.length >= 2) {
    if (correlations.length === 0) {
      lines.push(
        `Кореляції: недостатньо спільних днів (потрібно ≥${MIN_CORRELATION_POINTS} з обома метриками).`,
      );
    } else {
      lines.push("Кореляції (Pearson r; на спільних днях):");
      for (const c of correlations) {
        lines.push(
          `  ${c.a} ↔ ${c.b}: r=${c.pearson.toFixed(2)} (Spearman ${c.spearman.toFixed(2)}, n=${c.n}): ${strength(c.pearson)}`,
        );
      }
    }
  }

  // Підсумки по метриці.
  lines.push("Підсумки:");
  for (const m of metrics) lines.push(`  ${summariseMetric(m, raw[m] ?? [])}`);

  // Таблиця (fill-застосована), обрізана до останніх MAX_TABLE_ROWS днів.
  const start = Math.max(0, days.length - MAX_TABLE_ROWS);
  const shownDays = days.slice(start);
  if (start > 0) {
    lines.push(`Таблиця (останні ${shownDays.length} з ${days.length} днів):`);
  } else {
    lines.push("Таблиця:");
  }
  lines.push(`day,${metrics.join(",")}`);
  for (let i = start; i < days.length; i++) {
    const cells = metrics.map((m) => {
      const v = (raw[m] ?? [])[i];
      if (v === undefined) return fill === "zero" ? "0" : "";
      return fmt(v);
    });
    lines.push(`${days[i]},${cells.join(",")}`);
  }

  return lines.join("\n");
}

// ─── Екзекутор ───────────────────────────────────────────────────────────────

function parseMetrics(input: unknown): DailyMetric[] {
  const arr = Array.isArray(input) ? input : [];
  const seen = new Set<DailyMetric>();
  for (const raw of arr) {
    const m = String(raw).trim() as DailyMetric;
    if ((DAILY_SERIES_METRICS as readonly string[]).includes(m)) seen.add(m);
    if (seen.size >= MAX_METRICS) break;
  }
  return [...seen];
}

export function getDailySeries(action: GetDailySeriesAction): string {
  const input = action.input || { metrics: [] };
  const metrics = parseMetrics(input.metrics);
  if (metrics.length === 0) {
    return `Вкажи 1-${MAX_METRICS} метрик зі списку: ${DAILY_SERIES_METRICS.join(", ")}.`;
  }
  const { from, to } = resolveRange(
    input.date_from,
    input.date_to,
    (input as { period_days?: number | string }).period_days,
  );
  const habitId =
    typeof input.habit_id === "string" && input.habit_id.trim()
      ? input.habit_id.trim()
      : undefined;
  const fill: "zero" | "null" = input.fill === "null" ? "null" : "zero";

  const series = buildDailySeries(metrics, {
    from,
    to,
    ...(habitId ? { habitId } : {}),
  });
  const correlations = computePairwiseCorrelations(series);
  return formatDailySeries(series, correlations, fill);
}
