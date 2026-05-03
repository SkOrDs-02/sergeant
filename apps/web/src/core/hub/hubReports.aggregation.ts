/**
 * Pure cross-module aggregation for Hub-Reports.
 *
 * До цього вся логіка жила всередині `useReportData` у HubReports.tsx —
 * inline-замикання, які напряму читали `localStorage`/`safeReadLS`. Це не
 * давало юніт-тестувати агрегацію без jsdom + localStorage-мокінгу і взагалі
 * без рендера HubReports. Цей модуль витягує **тільки чисті агрегатори**:
 * вхід — десеріалізовані структури (масив тренувань, масив транзакцій,
 * routine-state, nutrition-log) + dateSet; вихід — `{count|total|pct, daily}`.
 *
 * HubReports.tsx тепер тонка обгортка: читає LS → передає сюди → отримує
 * `ReportData` → рендерить. Усі snapshot-тести у `hubReports.aggregation.test.ts`
 * покривають саме цей модуль.
 */

import { parseFizrukWorkouts } from "@shared/lib/ui/parseFizrukWorkouts";
import { calcFinykSpendingByDate } from "@finyk/utils";

// ── Date helpers ─────────────────────────────────────────────────────────────

export type Period = "week" | "month";

export interface PeriodRange {
  start: Date;
  end: Date;
}

export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * Тиждень: пн–нд (Kyiv-style; getDay() = 0 = неділя). Місяць: 1-ше – останнє
 * число. `offset = 0` — поточний період, `-1` — попередній, `+1` — наступний.
 *
 * `now` параметр інʼєктовний — щоб тести могли фіксувати "today" і не залежати
 * від системного часу. Дефолт — `new Date()`, як було inline у HubReports.
 */
export function getPeriodRange(
  period: Period,
  offset = 0,
  now: Date = new Date(),
): PeriodRange {
  if (period === "week") {
    const mondayOffset = (now.getDay() + 6) % 7;
    const mon = new Date(now);
    mon.setDate(now.getDate() - mondayOffset + offset * 7);
    mon.setHours(0, 0, 0, 0);
    const sun = addDays(mon, 6);
    return { start: mon, end: sun };
  }
  const y = now.getFullYear();
  const m = now.getMonth() + offset;
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  return { start, end };
}

export function datesInRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    dates.push(localDateKey(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

// ── Per-module aggregators ───────────────────────────────────────────────────

export interface WorkoutsAggregate {
  count: number;
  daily: Record<string, number>;
}

export interface SpendingAggregate {
  total: number;
  daily: Record<string, number>;
}

export interface HabitsAggregate {
  pct: number;
  daily: Record<string, number>;
}

export interface KcalAggregate {
  total: number;
  avg: number;
  daily: Record<string, number>;
}

interface Workout {
  startedAt?: number;
  endedAt?: number | null;
}

/**
 * Рахує закінчені тренування (`endedAt` truthy) у заданому date-range.
 *
 * `rawWorkouts` — те саме, що `localStorage.getItem("fizruk_workouts_v1")`
 * (string чи null). Парсинг ховаємо за `parseFizrukWorkouts`, який уже
 * хендлить обидва legacy-shape-и (`[]` і `{ workouts: [] }`) та malformed JSON.
 *
 * Інваріант: коли LS-ключ існує і парситься в порожній масив, повертаємо
 * `count: 0, daily: {}` — точно як inline-логіка у HubReports. Коли LS-ключ
 * відсутній зовсім — теж `count: 0, daily: {}` (HubReports мав early-return,
 * ми його дублюємо для backward-compat snapshot-equality).
 */
export function aggregateWorkouts(
  rawWorkouts: string | null,
  dates: string[],
): WorkoutsAggregate {
  const workouts = parseFizrukWorkouts(rawWorkouts) as Workout[];
  if (!workouts.length && !rawWorkouts) return { count: 0, daily: {} };

  const dateSet = new Set(dates);
  const daily: Record<string, number> = {};
  let count = 0;
  for (const w of workouts) {
    if (!w.endedAt) continue;
    if (typeof w.startedAt !== "number") continue;
    const dk = localDateKey(new Date(w.startedAt));
    if (!dateSet.has(dk)) continue;
    count++;
    daily[dk] = (daily[dk] || 0) + 1;
  }
  return { count, daily };
}

interface FinykTx {
  id: string;
  amount: number;
  time: number;
  description?: string;
}

export interface SpendingInputs {
  txList: FinykTx[];
  excludedTxIds: string[] | Set<string>;
  txSplits: Record<string, unknown[]>;
}

/**
 * Делегує до `calcFinykSpendingByDate` (єдиний source-of-truth для
 * Фінік-агрегації — використовується також у Overview/digest). Тут лише
 * адаптуємо вхід під Hub-Reports форму (dateSet з рядкових ключів +
 * `localDateKey` як локалізатор).
 */
export function aggregateSpending(
  inputs: SpendingInputs,
  dates: string[],
): SpendingAggregate {
  return calcFinykSpendingByDate(inputs.txList, {
    excludedTxIds: inputs.excludedTxIds,
    txSplits: inputs.txSplits,
    dateSet: new Set(dates),
    localDateKeyFn: localDateKey,
  });
}

interface Habit {
  id: string;
  archived?: boolean;
}

export interface RoutineState {
  habits?: Habit[];
  completions?: Record<string, string[]>;
}

/**
 * Рахує % виконання звичок: `done / possible * 100` сумарно по всіх днях у
 * діапазоні, плюс daily-розклад для bar-chart-у. Архівовані звички
 * виключаються з `possible` (ефективно "не існували в цьому періоді").
 *
 * Інваріант: `state == null` → `pct: 0, daily: {}` (HubReports повертав той же
 * shape; знаменник 0 теж дає 0 без NaN).
 */
export function aggregateHabits(
  state: RoutineState | null,
  dates: string[],
): HabitsAggregate {
  if (!state) return { pct: 0, daily: {} };
  const habits = Array.isArray(state.habits)
    ? state.habits.filter((h) => !h.archived)
    : [];
  const completions = state.completions ?? {};
  if (!habits.length) return { pct: 0, daily: {} };

  const daily: Record<string, number> = {};
  let totalPossible = 0;
  let totalDone = 0;
  for (const dk of dates) {
    const possible = habits.length;
    const done = habits.filter(
      (h) => Array.isArray(completions[h.id]) && completions[h.id].includes(dk),
    ).length;
    totalPossible += possible;
    totalDone += done;
    daily[dk] = possible > 0 ? Math.round((done / possible) * 100) : 0;
  }
  return {
    pct: totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0,
    daily,
  };
}

interface NutritionMeal {
  macros?: { kcal?: number };
}

interface NutritionDayLog {
  meals?: NutritionMeal[];
}

export type NutritionLog = Record<string, NutritionDayLog>;

/**
 * Сума ккал у meal-log за період. Daily-точка — сума `meal.macros.kcal` усіх
 * прийомів за день (округлюється). `avg` — це **середнє по днях, де є хоч
 * один meal**, а не по всіх днях періоду — навмисно, бо HubReports так і
 * робив (нульові дні не "розмазують" середнє).
 */
export function aggregateKcal(
  log: NutritionLog | null | undefined,
  dates: string[],
): KcalAggregate {
  const safeLog: NutritionLog = log ?? {};
  const dateSet = new Set(dates);
  const daily: Record<string, number> = {};
  let total = 0;
  for (const dk of Object.keys(safeLog)) {
    if (!dateSet.has(dk)) continue;
    const meals = Array.isArray(safeLog[dk]?.meals) ? safeLog[dk].meals! : [];
    const kcal = meals.reduce((s, m) => s + (m?.macros?.kcal ?? 0), 0);
    total += kcal;
    daily[dk] = Math.round(kcal);
  }
  const daysWithData = Object.keys(daily).length;
  return {
    total: Math.round(total),
    avg: daysWithData > 0 ? Math.round(total / daysWithData) : 0,
    daily,
  };
}

// ── Cross-module report aggregator ───────────────────────────────────────────

export interface ReportInputs {
  /** Raw `localStorage.getItem("fizruk_workouts_v1")` — string чи null. */
  rawFizrukWorkouts: string | null;
  /** Спред Фінік-вхідних даних. */
  finyk: SpendingInputs;
  /** Десеріалізований `safeReadLS("hub_routine_v1", null)` (або null). */
  routineState: RoutineState | null;
  /** Десеріалізований `safeReadLS("nutrition_log_v1", {})` (або null/undefined). */
  nutritionLog: NutritionLog | null | undefined;
}

export interface ReportData {
  period: { start: Date; end: Date; dates: string[] };
  workouts: { cur: WorkoutsAggregate; prev: WorkoutsAggregate };
  spending: { cur: SpendingAggregate; prev: SpendingAggregate };
  habits: { cur: HabitsAggregate; prev: HabitsAggregate };
  kcal: { cur: KcalAggregate; prev: KcalAggregate };
}

/**
 * Топ-функція HubReports: бере `period`/`offset`/`now` + усі dependencies
 * (вже прочитані з LS) і повертає cur/prev-агрегати по 4 модулях.
 *
 * Чиста: жодного `localStorage.getItem`, жодних побічних ефектів. Snapshot-
 * тести у `hubReports.aggregation.test.ts` покривають саме її через realistic
 * фікстури всіх 4 модулів одразу.
 */
export function aggregateReport(
  period: Period,
  offset: number,
  inputs: ReportInputs,
  now: Date = new Date(),
): ReportData {
  const cur = getPeriodRange(period, offset, now);
  const prev = getPeriodRange(period, offset - 1, now);
  const curDates = datesInRange(cur.start, cur.end);
  const prevDates = datesInRange(prev.start, prev.end);

  return {
    period: { start: cur.start, end: cur.end, dates: curDates },
    workouts: {
      cur: aggregateWorkouts(inputs.rawFizrukWorkouts, curDates),
      prev: aggregateWorkouts(inputs.rawFizrukWorkouts, prevDates),
    },
    spending: {
      cur: aggregateSpending(inputs.finyk, curDates),
      prev: aggregateSpending(inputs.finyk, prevDates),
    },
    habits: {
      cur: aggregateHabits(inputs.routineState, curDates),
      prev: aggregateHabits(inputs.routineState, prevDates),
    },
    kcal: {
      cur: aggregateKcal(inputs.nutritionLog, curDates),
      prev: aggregateKcal(inputs.nutritionLog, prevDates),
    },
  };
}
