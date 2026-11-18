/**
 * Звичка з лічильником («2 з 3 склянок»): доменне ядро без персистенції.
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
 * Як це тримає всі агрегати незмінними: відмітка виконання дня
 * (`completions`) лишається єдиним входом метрик, а лічильник лише вирішує,
 * чи вона стоїть. Досягнуто ціль — відмітка ставиться тим самим редʼюсером
 * `applyToggleHabitCompletion`, що й тап по кружку (розклад, заборона
 * майбутнього, зняття «не зміг»); опустився нижче цілі — знімається ним же.
 *
 * AI-DANGER: персистенції ще НЕМАЄ. Ціль і одиниця звички та лічильники
 * днів потребують серверної й клієнтської міграцій (спека
 * `docs/work/specs/routine-counter-automark-percent-and-hub-rows.md`
 * § Поза скоупом), тож тут лише чисті функції над переданими структурами,
 * а `Habit` / `RoutineState` нових полів не мають. Не підключай це в UI,
 * доки лічильник не переживає перезавантаження.
 */

import {
  applyToggleHabitCompletion,
  type CompletionDayBounds,
} from "./reducers.js";
import type { RoutineState } from "./types.js";

/** Ціль лічильника звички. `target` — ціле ≥ 1, `unit` — підпис одиниці. */
export interface HabitCounterSpec {
  target: number;
  unit: string;
}

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

export interface CounterStepResult {
  state: RoutineState;
  counts: HabitDayCounts;
  /** Кількість за день після кроку. */
  count: number;
  /** Чи день зараховано виконаним (відмітка стоїть у `completions`). */
  done: boolean;
}

/**
 * Додати `delta` кроків (тап = `+1`, «Скасувати» = `-1`) звичці за день.
 *
 * No-op (ті самі посилання на `state` і `counts`), коли звички немає, день
 * у майбутньому або звичка на цей день не запланована й лічильник порожній,
 * тобто там, де `applyToggleHabitCompletion` відмовив би у відмітці.
 */
export function applyHabitCounterStep(
  state: RoutineState,
  counts: HabitDayCounts,
  habitId: string,
  dateKey: string,
  delta: number,
  spec: HabitCounterSpec,
  bounds: CompletionDayBounds,
): CounterStepResult {
  const prevCount = counts[habitId]?.[dateKey] ?? 0;
  const wasDone = (state.completions[habitId] ?? []).includes(dateKey);
  const unchanged: CounterStepResult = {
    state,
    counts,
    count: prevCount,
    done: wasDone,
  };
  if (!state.habits.some((h) => h.id === habitId)) return unchanged;
  if (!Number.isFinite(delta) || delta === 0) return unchanged;

  const nextCount = Math.max(0, Math.floor(prevCount + delta));
  const wantDone = counterReached(nextCount, spec.target);

  let nextState = state;
  if (wantDone !== wasDone) {
    nextState = applyToggleHabitCompletion(state, habitId, dateKey, bounds);
    // Редʼюсер відмовив (майбутнє, не за розкладом): лічильник теж не
    // рухаємо, інакше «3 з 3» стояло б без відмітки.
    if (nextState === state) return unchanged;
  } else if (delta > 0 && prevCount === 0) {
    // Перший крок без досягнення цілі: та сама межа, що й для відмітки.
    const probe = applyToggleHabitCompletion(state, habitId, dateKey, bounds);
    if (probe === state) return unchanged;
  }

  const forHabit = { ...(counts[habitId] ?? {}) };
  if (nextCount === 0) delete forHabit[dateKey];
  else forHabit[dateKey] = nextCount;
  const nextCounts = { ...counts };
  if (Object.keys(forHabit).length === 0) delete nextCounts[habitId];
  else nextCounts[habitId] = forHabit;

  return {
    state: nextState,
    counts: nextCounts,
    count: nextCount,
    done: (nextState.completions[habitId] ?? []).includes(dateKey),
  };
}
