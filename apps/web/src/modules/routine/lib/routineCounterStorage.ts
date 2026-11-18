/**
 * Лічильник і автовідмітка звички поверх сховища Рутини (Р-1 (а) і (в),
 * міграція 170). Чисті правила живуть у домені (`counterHabit.ts`,
 * `autoMark.ts`); тут лише межа доби пристрою, запис і памʼять «знято
 * сьогодні».
 */
import { z } from "zod";
import {
  applyAutoMarkSignal,
  applyHabitCounterStep,
  shouldSuppressAutoMark,
  type AutoMarkSource,
  type CounterStepResult,
  type RoutineState,
} from "@sergeant/routine-domain";
import { STORAGE_KEYS } from "@sergeant/shared";
import { safeReadLSValidated, safeWriteLS } from "@shared/lib/storage/storage";

import { anchoredCompletionBounds, anchoredTodayKey } from "./dayAnchor";
import { loadRoutineState, saveRoutineState } from "./routineStorage";

const SuppressedSchema = z.object({
  dayKey: z.string(),
  habitIds: z.array(z.string()),
});

/**
 * Звички, відмітку яких людина сьогодні зняла (памʼять пристрою, без
 * синку — відповідь founder-а 2026-11-18). Учорашній запис = порожньо.
 */
export function readAutoMarkSuppressed(todayKey: string): Set<string> {
  const stored = safeReadLSValidated<z.infer<typeof SuppressedSchema> | null>(
    STORAGE_KEYS.ROUTINE_AUTO_MARK_SUPPRESSED,
    SuppressedSchema,
    null,
  );
  return new Set(stored && stored.dayKey === todayKey ? stored.habitIds : []);
}

function rememberSuppressed(habitId: string, todayKey: string): void {
  const ids = readAutoMarkSuppressed(todayKey);
  if (ids.has(habitId)) return;
  ids.add(habitId);
  safeWriteLS(STORAGE_KEYS.ROUTINE_AUTO_MARK_SUPPRESSED, {
    dayKey: todayKey,
    habitIds: [...ids],
  });
}

/**
 * Після будь-якої зміни відмітки рукою: якщо відмітку за сьогодні знято,
 * автовідмітка цієї звички до кінця доби не повертається (П-13 (А)).
 */
export function noteManualCompletionChange(
  prev: RoutineState,
  next: RoutineState,
  habitId: string,
  dateKey: string,
): void {
  const todayKey = anchoredTodayKey();
  if (shouldSuppressAutoMark(prev, next, habitId, dateKey, todayKey)) {
    rememberSuppressed(habitId, todayKey);
  }
}

/** Крок лічильника на свіжому стані з записом. */
export function stepHabitCounter(
  habitId: string,
  dateKey: string,
  delta: number,
): CounterStepResult & { prev: RoutineState } {
  const prev = loadRoutineState();
  const result = applyHabitCounterStep(
    prev,
    habitId,
    dateKey,
    delta,
    anchoredCompletionBounds(),
  );
  if (result.changed) {
    saveRoutineState(result.state);
    noteManualCompletionChange(prev, result.state, habitId, dateKey);
  }
  return { ...result, prev };
}

/**
 * Подія іншого модуля на цьому пристрої (`hubBus` `routineAutoMark`):
 * відмітити привʼязані звички за сьогодні. Повертає id відмічених.
 */
export function applyAutoMarkFromSignal(
  source: AutoMarkSource,
  eventDayKey: string,
): { prev: RoutineState; next: RoutineState; markedHabitIds: string[] } {
  const todayKey = anchoredTodayKey();
  const prev = loadRoutineState();
  const { state, markedHabitIds } = applyAutoMarkSignal(
    prev,
    source,
    eventDayKey,
    { todayKey, suppressedHabitIds: readAutoMarkSuppressed(todayKey) },
  );
  if (state !== prev) saveRoutineState(state);
  return { prev, next: state, markedHabitIds };
}
