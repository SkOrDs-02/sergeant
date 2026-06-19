import { getTxStatAmount } from "../../../modules/finyk/utils";
import { loadRoutineState } from "../../../modules/routine/lib/routineStorage";
import {
  getKyivDayKey,
  getKyivMondayIndex,
  parseKyivDate,
} from "@shared/lib/time/kyivTime";
import { ls } from "../hubChatUtils";
import { readFizrukWorkouts } from "./fizrukActions/shared";
import type { ChatAction, ChatActionResult } from "./types";

/**
 * Read-only "talk to your data" виконавці для Рутини (PR3 talk-to-your-data).
 * Дзеркало серверних `QUERY_ROUTINE_TOOLS` (`toolDefs/queryRoutine.ts`). Жоден
 * з них НЕ пише — лише читають канонічний стан звичок через `loadRoutineState()`
 * (SQLite-backed, той самий source, що й мутаційний `handleRoutineAction`) і,
 * для кореляцій, журнал тренувань (`readWorkouts`) та банк-кеш транзакцій
 * (`finyk_tx_cache`).
 *
 * Реєструється у `hubChatActions.ts` dispatch-chain окремою гілкою, не
 * чіпаючи мутаційний `handleRoutineAction`. Дні рахуються від `Date.now()`
 * (days-ago cutoff); day-key — Europe/Kyiv через `getKyivDayKey`.
 */

interface QueryHabitsAction {
  name: "query_habits";
  input: { habit?: string; period_days?: number | string };
}

interface HabitCorrelationAction {
  name: "habit_correlation";
  input: {
    habit?: string;
    against?: string;
    period_days?: number | string;
  };
}

type CorrelationMetric = "spending" | "workouts";

const DAY_MS = 86_400_000;

// Mon-first 0..6 — matches `getKyivMondayIndex` and routine-domain weekday
// indexing. Labels are the Ukrainian short names used across the routine UI.
const WEEKDAY_LABEL_UK: readonly string[] = [
  "Пн",
  "Вт",
  "Ср",
  "Чт",
  "Пт",
  "Сб",
  "Нд",
];

// ─── data source ─────────────────────────────────────────────────────────────

interface RoutineHabit {
  id: string;
  name?: string;
  emoji?: string;
  archived?: boolean;
  paused?: boolean;
}

/**
 * Read-only routine snapshot from the canonical SQLite-backed state.
 *
 * Stage 8 PR #057r-tombstone retired the legacy `hub_routine_v1` LS key — it is
 * deleted on boot after the one-time SQLite import (`residualImport.ts`) and
 * `saveRoutineState()` (used by the routine write tools) no longer writes it.
 * Reading that key here returned an empty journal in production, so
 * `query_habits` / `habit_correlation` answered "Немає звичок" even for users
 * with habits, and a habit just created via the `create_habit` write tool
 * (which persists through `loadRoutineState`/`saveRoutineState`) was invisible
 * to this read tool. We read `loadRoutineState()` — the same canonical source
 * the routine UI and `handleRoutineAction` use — so reads and writes agree.
 */
function readRoutine(): {
  habits: RoutineHabit[];
  completions: Record<string, string[]>;
} {
  const state = loadRoutineState();
  const habits = Array.isArray(state.habits)
    ? (state.habits as RoutineHabit[])
    : [];
  const completions =
    state.completions && typeof state.completions === "object"
      ? state.completions
      : {};
  return { habits, completions };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function clampDays(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(365, Math.floor(n));
}

function round(n: number): number {
  return Math.round(n);
}

/** Mon-first weekday index (0=Пн … 6=Нд) for a `YYYY-MM-DD` day key. */
function mondayIndexOfDayKey(dayKey: string): number {
  const date = parseKyivDate(dayKey);
  return date ? getKyivMondayIndex(date) : 0;
}

function activeHabits(habits: RoutineHabit[]): RoutineHabit[] {
  return habits.filter((h) => !h.archived && !h.paused);
}

/**
 * Resolve which habits a query targets: by id, by name substring, or — when
 * no filter is given — all active habits.
 */
function selectHabits(habits: RoutineHabit[], filter: string): RoutineHabit[] {
  if (!filter) return activeHabits(habits);
  const byId = habits.filter((h) => h.id.toLowerCase() === filter);
  if (byId.length > 0) return byId;
  return habits.filter((h) => normalizeText(h.name).includes(filter));
}

/** Day keys (Kyiv) for the last `days`, today inclusive — newest first. */
function lastDayKeys(days: number): string[] {
  const keys: string[] = [];
  const now = Date.now();
  for (let i = 0; i < days; i++) {
    keys.push(getKyivDayKey(now - i * DAY_MS));
  }
  return keys;
}

function habitLabel(h: RoutineHabit): string {
  const name = (h.name || h.id).trim();
  return h.emoji ? `${h.emoji} ${name}` : name;
}

/** Human scope label: single habit by name, else an active-habit count. */
function scopeLabel(targets: RoutineHabit[]): string {
  const only = targets.length === 1 ? targets[0] : undefined;
  return only ? `"${habitLabel(only)}"` : `${targets.length} активних звичок`;
}

// ─── executors ──────────────────────────────────────────────────────────────

export function queryHabits(action: QueryHabitsAction): ChatActionResult {
  const filter = normalizeText(action.input.habit);
  const days = clampDays(action.input.period_days, 30);
  const { habits, completions } = readRoutine();

  if (habits.length === 0) return "Немає звичок у журналі Рутини.";

  const targets = selectHabits(habits, filter);
  if (targets.length === 0) {
    return `Звичку "${action.input.habit}" не знайдено.`;
  }

  const dayKeys = lastDayKeys(days);
  const targetIds = new Set(targets.map((h) => h.id));

  // Done-counts per Mon-first weekday across all targeted habits.
  const doneByWeekday = new Array<number>(7).fill(0);
  const totalByWeekday = new Array<number>(7).fill(0);
  let doneTotal = 0;
  const missedDays: string[] = [];

  for (const dk of dayKeys) {
    const wd = mondayIndexOfDayKey(dk);
    let dayDone = 0;
    for (const id of targetIds) {
      totalByWeekday[wd] = (totalByWeekday[wd] ?? 0) + 1;
      const list = completions[id];
      if (Array.isArray(list) && list.includes(dk)) {
        doneByWeekday[wd] = (doneByWeekday[wd] ?? 0) + 1;
        dayDone += 1;
        doneTotal += 1;
      }
    }
    if (dayDone === 0 && missedDays.length < 5) missedDays.push(dk);
  }

  const possible = days * targetIds.size;
  const pct = possible > 0 ? round((doneTotal / possible) * 100) : 0;

  // Best / worst weekday by completion rate (only weekdays that occurred).
  const rates = WEEKDAY_LABEL_UK.map((label, i) => {
    const total = totalByWeekday[i] ?? 0;
    const done = doneByWeekday[i] ?? 0;
    return { label, rate: total > 0 ? done / total : null };
  }).filter((r): r is { label: string; rate: number } => r.rate !== null);
  const best = [...rates].sort((a, b) => b.rate - a.rate)[0];
  const worst = [...rates].sort((a, b) => a.rate - b.rate)[0];

  const scope = scopeLabel(targets);

  const lines = [
    `Статистика ${scope} за ${days} днів:`,
    `Виконано: ${doneTotal}/${possible} (${pct}%)`,
  ];
  if (best && worst) {
    lines.push(
      `Найкращий день: ${best.label} (${round(best.rate * 100)}%), найгірший: ${worst.label} (${round(worst.rate * 100)}%)`,
    );
  }
  if (missedDays.length > 0) {
    lines.push(`Дні без жодного виконання: ${missedDays.join(", ")}`);
  }
  return lines.join("\n");
}

function normalizeMetric(value: unknown): CorrelationMetric {
  const s = normalizeText(value);
  if (s === "workouts" || s === "тренування" || s === "fizruk") {
    return "workouts";
  }
  return "spending";
}

/** Per-Kyiv-day expense total (грн) from the bank tx cache. */
function spendingByDay(days: number): Map<string, number> {
  const cache = ls<{
    txs?: Array<{
      id: string;
      amount: number;
      time?: number;
      description?: string;
      mcc?: number;
    }>;
    // eslint-disable-next-line sergeant-design/no-raw-storage-key -- chat-action executors run outside React, so the finyk `useStorage` hooks are unavailable; the `STORAGE_KEYS.FINYK_*` constants are themselves banned for direct access (no-restricted-syntax, PR #039). Read-only mirror of `queryFinykActions.ts`.
  } | null>("finyk_tx_cache", null);
  // eslint-disable-next-line sergeant-design/no-raw-storage-key -- see finyk_tx_cache note above; read-only correlation source.
  const txSplits = ls<Record<string, unknown>>("finyk_tx_splits", {});
  const byDay = new Map<string, number>();
  const cutoffTs = (Date.now() - days * DAY_MS) / 1000;
  if (!cache?.txs) return byDay;
  for (const t of cache.txs) {
    if ((t.time || 0) < cutoffTs) continue;
    if (t.amount >= 0) continue; // expenses only (negative amounts)
    const dk = getKyivDayKey((t.time || 0) * 1000);
    const spent = getTxStatAmount(t, txSplits);
    byDay.set(dk, (byDay.get(dk) ?? 0) + spent);
  }
  return byDay;
}

/** Per-Kyiv-day completed-workout count. */
function workoutsByDay(days: number): Map<string, number> {
  const byDay = new Map<string, number>();
  const cutoff = Date.now() - days * DAY_MS;
  for (const w of readFizrukWorkouts()) {
    if (!w.endedAt) continue;
    const ts = new Date(w.startedAt).getTime();
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    const dk = getKyivDayKey(ts);
    byDay.set(dk, (byDay.get(dk) ?? 0) + 1);
  }
  return byDay;
}

export function habitCorrelation(
  action: HabitCorrelationAction,
): ChatActionResult {
  const filter = normalizeText(action.input.habit);
  const metric = normalizeMetric(action.input.against);
  const days = clampDays(action.input.period_days, 60);
  const { habits, completions } = readRoutine();

  if (habits.length === 0) return "Немає звичок у журналі Рутини.";
  const targets = selectHabits(habits, filter);
  if (targets.length === 0) {
    return `Звичку "${action.input.habit}" не знайдено.`;
  }
  const targetIds = new Set(targets.map((h) => h.id));

  const dayKeys = lastDayKeys(days);
  const metricByDay =
    metric === "workouts" ? workoutsByDay(days) : spendingByDay(days);

  let withSum = 0;
  let withCount = 0;
  let withoutSum = 0;
  let withoutCount = 0;

  for (const dk of dayKeys) {
    const habitDone = [...targetIds].some((id) => {
      const list = completions[id];
      return Array.isArray(list) && list.includes(dk);
    });
    const value = metricByDay.get(dk) ?? 0;
    if (habitDone) {
      withSum += value;
      withCount += 1;
    } else {
      withoutSum += value;
      withoutCount += 1;
    }
  }

  if (withCount === 0) {
    return `Немає днів із виконанням звички за останні ${days} днів — нема що корелювати.`;
  }
  if (withoutCount === 0) {
    return `Звичка виконувалась усі ${days} днів — нема днів без неї для порівняння.`;
  }

  const withAvg = withSum / withCount;
  const withoutAvg = withoutSum / withoutCount;
  const unit = metric === "workouts" ? "тренувань/день" : "грн/день";
  const metricTitle = metric === "workouts" ? "Тренування" : "Витрати";
  const delta = withAvg - withoutAvg;
  const pct = withoutAvg !== 0 ? (delta / withoutAvg) * 100 : 0;
  const sign = (n: number): string => (n >= 0 ? "+" : "");
  const scope = scopeLabel(targets);

  return [
    `${metricTitle} ↔ ${scope} за ${days} днів:`,
    `Дні зі звичкою (${withCount}): ${round(withAvg)} ${unit}`,
    `Дні без неї (${withoutCount}): ${round(withoutAvg)} ${unit}`,
    `Різниця: ${sign(delta)}${round(delta)} ${unit} (${sign(pct)}${pct.toFixed(1)}%)`,
  ].join("\n");
}

/**
 * Доменний router для read-only routine query-tools. Повертає `undefined` для
 * нерелевантних дій, щоб `hubChatActions.dispatch` пішов далі по ланцюгу.
 */
export function handleQueryRoutineAction(
  action: ChatAction,
): ChatActionResult | undefined {
  switch (action.name) {
    case "query_habits":
      return queryHabits(action as QueryHabitsAction);
    case "habit_correlation":
      return habitCorrelation(action as HabitCorrelationAction);
    default:
      return undefined;
  }
}
