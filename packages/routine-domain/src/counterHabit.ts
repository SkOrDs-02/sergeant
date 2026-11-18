/**
 * Звичка з лічильником («2 з 3 склянок»): доменне ядро.
 *
 * AI-CONTEXT: OD-29, Р-1 (а). Рішення власника 2026-11-18:
 *
 * - П-12 (А): частково виконаний день («2 з 3») — **не виконано**. Серія
 *   не має окремого правила: день без відмітки читається тим самим
 *   `flexibleStreakBreakdown`, що й мовчазний пропуск, тож бере заморозку
 *   за чинним grace-бюджетом (канон §4) або обриває серію, коли запас
 *   вичерпано. Відсоток, heatmap і серія нічого про лічильник не знають.
 * - Дефолт § 11.8 (founder не заперечив): тап після досягнення цілі рахує
 *   далі, «4 з 3».
 *
 * Відмітка дня (`completions`) лишається єдиним входом метрик, а лічильник
 * (`RoutineState.counts`, таблиця `routine_habit_counts`, міграція 170) лише
 * вирішує, чи вона стоїть. Відмітку ставить і знімає той самий редʼюсер
 * `applyToggleHabitCompletion`, що й тап по кружку (розклад, заборона
 * майбутнього, зняття «не зміг»).
 *
 * Інженерний дефолт (спека, § Рішення дизайну): **крок угору ніколи не
 * знімає відмітку**, а крок униз знімає її лише тоді, коли лічильник
 * перетинає ціль згори (≥ ціль → < ціль). Тож день, відмічений рукою (або
 * «Відмітити всі», або автовідміткою) з лічильником 0, після «+1» лишається
 * виконаним із «1 з 3», а не губить відмітку.
 */

import { habitCountTarget } from "./counterFields.js";
import {
  applyToggleHabitCompletion,
  type CompletionDayBounds,
} from "./reducers.js";
import type { RoutineState } from "./types.js";

/** Лічильники днів: `habitId → dateKey → кількість кроків`. */
export type HabitDayCounts = Record<string, Record<string, number>>;

/** Чи ціль дня досягнута. Невалідна ціль (не ціле ≥ 1) не досягається ніколи. */
export function counterReached(count: number, target: number): boolean {
  if (!Number.isInteger(target) || target < 1) return false;
  return count >= target;
}

/** Підпис прогресу дня: «2 з 3», після цілі — «4 з 3». */
export function counterProgressLabel(count: number, target: number): string {
  return `${Math.max(0, Math.floor(count))} з ${target}`;
}

/** Кроки звички за день (0, якщо не записано). */
export function habitDayCount(
  state: Pick<RoutineState, "counts">,
  habitId: string,
  dateKey: string,
): number {
  return state.counts?.[habitId]?.[dateKey] ?? 0;
}

export interface CounterStepResult {
  state: RoutineState;
  /** Кількість за день після кроку. */
  count: number;
  /** Чи день зараховано виконаним (відмітка стоїть у `completions`). */
  done: boolean;
  /** Чи щось змінилось (лічильник або відмітка). */
  changed: boolean;
}

/**
 * Додати `delta` кроків (тап = `+1`, «Скасувати» або «−» = `-1`) звичці
 * з лічильником за день.
 *
 * No-op (те саме посилання на `state`), коли звички немає, вона без
 * лічильника, день у майбутньому, або звичка на цей день не запланована й
 * лічильник порожній, тобто там, де `applyToggleHabitCompletion` відмовив би
 * у відмітці.
 */
export function applyHabitCounterStep(
  state: RoutineState,
  habitId: string,
  dateKey: string,
  delta: number,
  bounds: CompletionDayBounds,
): CounterStepResult {
  const habit = state.habits.find((h) => h.id === habitId);
  const target = habitCountTarget(habit);
  const prevCount = habitDayCount(state, habitId, dateKey);
  const wasDone = (state.completions[habitId] ?? []).includes(dateKey);
  const unchanged: CounterStepResult = {
    state,
    count: prevCount,
    done: wasDone,
    changed: false,
  };
  if (!habit || target === null) return unchanged;
  if (!Number.isFinite(delta) || delta === 0) return unchanged;

  const nextCount = Math.max(0, Math.floor(prevCount + delta));
  if (nextCount === prevCount) return unchanged;

  let nextState = state;
  if (delta > 0) {
    // Межа та сама, що й для відмітки: майбутнє і поза розкладом — ні.
    const probe = wasDone
      ? state
      : applyToggleHabitCompletion(state, habitId, dateKey, bounds);
    if (!wasDone && probe === state) return unchanged;
    if (!wasDone && counterReached(nextCount, target)) nextState = probe;
  } else if (
    wasDone &&
    counterReached(prevCount, target) &&
    !counterReached(nextCount, target)
  ) {
    nextState = applyToggleHabitCompletion(state, habitId, dateKey, bounds);
  }

  const forHabit = { ...(state.counts?.[habitId] ?? {}) };
  if (nextCount === 0) delete forHabit[dateKey];
  else forHabit[dateKey] = nextCount;
  const counts = { ...(state.counts ?? {}) };
  if (Object.keys(forHabit).length === 0) delete counts[habitId];
  else counts[habitId] = forHabit;

  const out: RoutineState = { ...nextState, counts };
  return {
    state: out,
    count: nextCount,
    done: (out.completions[habitId] ?? []).includes(dateKey),
    changed: true,
  };
}
