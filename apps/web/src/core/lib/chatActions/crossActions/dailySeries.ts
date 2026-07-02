/* eslint-disable sergeant-design/no-raw-storage-key --
   Cross-module daily-series reader (outside React): the finyk tx cache + splits
   stay on LS (no SQLite canon), mirroring financeAnalytics / briefingHandlers.
   Raw-key burndown tracked for 2026-Q3. */
/**
 * `get_daily_series` — вирівняні по днях ряди метрик з усіх 4 модулів +
 * пораховані КОДОМ кореляції (Pearson/Spearman) для кожної пари. Це базовий
 * примітив для «чи пов'язано X з Y»: раніше модель мусила зіставляти агрегати
 * різної форми з кількох query-тулів «в умі», що ненадійно.
 *
 * Усі читання йдуть ЛИШЕ через доменні storage-обгортки (не сирі LS-ключі, крім
 * `finyk_tx_cache`/`finyk_tx_splits`, які не мають SQLite-канону). День — завжди
 * `Europe/Kyiv` (`getKyivDayKey`). Гроші (finyk) віддаються у гривнях —
 * `getTxStatAmount` вже ділить копійки на 100.
 *
 * `buildDailySeries` та `computePairwiseCorrelations` — чисті й експортовані
 * навмисно: WP3 (кореляції у weekly digest → пам'ять коуча) переюзає той самий
 * обчислювальний код замість дублювання статистики.
 */
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { ls } from "../../hubChatUtils";
import { getTxStatAmount } from "../../../../modules/finyk/utils";
import { getCachedFinykSqliteState } from "../../../../modules/finyk/lib/sqliteReader";
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

function readFinyk(sign: "spending" | "income"): Map<string, number> {
  const out = new Map<string, number>();
  const cache = ls<{
    txs?: Array<{ id: string; amount: number; time?: number }>;
  } | null>("finyk_tx_cache", null);
  const txs = cache?.txs ?? [];
  const hidden = getCachedFinykSqliteState().hiddenTransactions;
  const splits = ls<Record<string, unknown>>("finyk_tx_splits", {});
  for (const t of txs) {
    if (hidden.includes(t.id || "")) continue;
    if (!t.time) continue;
    if (sign === "spending" && t.amount < 0) {
      addTo(out, getKyivDayKey(t.time * 1000), getTxStatAmount(t, splits));
    } else if (sign === "income" && t.amount > 0) {
      addTo(out, getKyivDayKey(t.time * 1000), t.amount / 100);
    }
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
  }
}

// ─── Побудова вирівняних рядів ───────────────────────────────────────────────

export interface DailySeries {
  from: string;
  to: string;
  days: string[];
  /** Сирі значення (undefined = немає запису того дня). */
  raw: Record<string, (number | undefined)[]>;
  metrics: DailyMetric[];
}

/**
 * Будує вирівняну по днях таблицю. `raw[metric][i]` = значення на `days[i]` або
 * `undefined`, якщо запису немає. Кореляції рахуються на `undefined`-aware
 * основі (див. `computePairwiseCorrelations`), тому `fill` впливає лише на
 * відображення, не на статистику.
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
    for (const [day, value] of readMetric(metric, opts.habitId)) {
      const i = dayIndex.get(day);
      if (i !== undefined) col[i] = value;
    }
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
    `Ряди метрик ${series.from} — ${series.to} (${days.length} днів; одиниці: ${metrics
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
          `  ${c.a} ↔ ${c.b}: r=${c.pearson.toFixed(2)} (Spearman ${c.spearman.toFixed(2)}, n=${c.n}) — ${strength(c.pearson)}`,
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
