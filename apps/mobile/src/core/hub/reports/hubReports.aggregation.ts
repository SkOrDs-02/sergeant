/**
 * Pure cross-module aggregation for the mobile Hub-Reports surface.
 *
 * Mirrors `apps/web/src/core/hub/hubReports.aggregation.ts`. The web copy
 * imports `@finyk/utils` (`calcFinykSpendingByDate`) and the web-only
 * `@shared/lib/ui/parseFizrukWorkouts`; neither resolves under the mobile
 * package graph, so this module re-implements the same math inline, reading
 * the same legacy MMKV shards that `coachSnapshot.ts` / `insightsEngine`
 * already read on native.
 *
 * Day boundaries follow `Europe/Kyiv` semantics the same way the web copy
 * does — week is пн–нд, month is 1-ше … останнє число — computed off the
 * device's local `Date`, which matches the rest of the app's date helpers.
 */

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
 * Week: пн–нд (Kyiv-style; getDay() === 0 === неділя). Month: 1-ше –
 * останнє число. `offset = 0` — поточний період, `-1` — попередній.
 * `now` is injectable so callers/tests can pin "today".
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

// ── Per-module aggregators ───────────────────────────────────────────────

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
  startedAt?: number | string;
  endedAt?: number | string | null;
}

/**
 * Parse the `fizruk_workouts_v1` shard, tolerating both legacy shapes
 * (`[]` and `{ workouts: [] }`) and malformed JSON. Mirrors
 * `parseFizrukWorkouts` from the web side without the web-only import.
 */
function parseWorkouts(raw: string | null): Workout[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as
      | Workout[]
      | { workouts?: Workout[] }
      | null;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.workouts)) return parsed.workouts;
  } catch {
    /* malformed — treated as empty */
  }
  return [];
}

/**
 * Counts finished workouts (`endedAt` truthy) inside the date range.
 * Empty/absent shard → `{ count: 0, daily: {} }`, matching the web copy.
 */
export function aggregateWorkouts(
  rawWorkouts: string | null,
  dates: string[],
): WorkoutsAggregate {
  const workouts = parseWorkouts(rawWorkouts);
  if (!workouts.length) return { count: 0, daily: {} };

  const dateSet = new Set(dates);
  const daily: Record<string, number> = {};
  let count = 0;
  for (const w of workouts) {
    if (!w.endedAt) continue;
    const started = w.startedAt;
    const startedDate =
      typeof started === "number"
        ? new Date(started)
        : typeof started === "string"
          ? new Date(started)
          : null;
    if (!startedDate || Number.isNaN(startedDate.getTime())) continue;
    const dk = localDateKey(startedDate);
    if (!dateSet.has(dk)) continue;
    count++;
    daily[dk] = (daily[dk] ?? 0) + 1;
  }
  return { count, daily };
}

interface FinykTx {
  id: string;
  amount: number;
  time: number;
}

export interface SpendingInputs {
  txList: FinykTx[];
  excludedTxIds: Set<string>;
}

/**
 * Sum of outgoing (`amount < 0`) transactions per day, excluding hidden /
 * transfer tx ids. Amounts are kopiykas (minor units) — kept as the raw
 * absolute integer so downstream `toLocaleString` renders whole hryvnia
 * the same way the web spending card does (it delegates to the same
 * minor-unit aggregation).
 */
export function aggregateSpending(
  inputs: SpendingInputs,
  dates: string[],
): SpendingAggregate {
  const dateSet = new Set(dates);
  const daily: Record<string, number> = {};
  let total = 0;
  for (const tx of inputs.txList) {
    if (inputs.excludedTxIds.has(tx.id)) continue;
    if (typeof tx.amount !== "number" || tx.amount >= 0) continue;
    const ts = tx.time > 1e10 ? tx.time : tx.time * 1000;
    const dk = localDateKey(new Date(ts));
    if (!dateSet.has(dk)) continue;
    const spent = Math.abs(tx.amount);
    total += spent;
    daily[dk] = (daily[dk] ?? 0) + spent;
  }
  return { total, daily };
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
 * Habit-completion percentage (`done / possible * 100`) summed across the
 * range, plus a daily series for the bar chart. Archived habits are
 * excluded. `state == null` → `{ pct: 0, daily: {} }`.
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
    const done = habits.filter((h) => {
      const list = completions[h.id];
      return Array.isArray(list) && list.includes(dk);
    }).length;
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

export type NutritionLog = Record<string, NutritionDayLog | undefined>;

/**
 * Sum of kcal in the meal log over the range. `avg` is the mean over days
 * that have at least one meal (zero days do not dilute the average) —
 * deliberately matching the web copy.
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
    const day = safeLog[dk];
    const meals = Array.isArray(day?.meals) ? day.meals : [];
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
