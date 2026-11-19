/**
 * Емітер автовідмітки Рутини з Фізрука (Р-1 (в), рішення founder-а
 * 2026-11-18): «завершене повноцінне тренування» відмічає звичку з джерелом
 * `fizruk_workout`. Слухач — `useRoutineAutoMark` у Рутині.
 *
 * AI-CONTEXT: кличеться лише з дії людини на цьому пристрої (крок
 * «Завершити» в `WorkoutJournalSection`), не з синку чи імпорту. Повноцінне —
 * чинний предикат стріку `isFullWorkout` (канон § 7–8), тож порожнє чи
 * обірване тренування подій не дає. Одне тренування — не більше однієї події
 * за життя сторінки: «Повернутись у сесію» і повторне «Завершити» того самого
 * id не відмічають звичку вдруге. День — день `endedAt` за годинником
 * пристрою (ADR-0078).
 */
import { deviceDayKey } from "@sergeant/shared";
import {
  isFullWorkout,
  type WorkoutWeightInput,
} from "@sergeant/fizruk-domain/domain";
import { emitHubBus } from "@shared/lib/modules/hubBus";

const signalled = new Set<string>();

export function signalFinishedWorkoutForRoutine(
  workout: WorkoutWeightInput & { readonly id: string },
  endedAtIso: string | null | undefined,
): boolean {
  if (!endedAtIso || signalled.has(workout.id)) return false;
  const endedMs = Date.parse(endedAtIso);
  if (!Number.isFinite(endedMs)) return false;
  if (!isFullWorkout({ ...workout, endedAt: endedAtIso })) return false;
  signalled.add(workout.id);
  emitHubBus("routineAutoMark", {
    source: "fizruk_workout",
    dayKey: deviceDayKey(new Date(endedMs)),
  });
  return true;
}

export function __resetRoutineAutoMarkSignalForTests(): void {
  signalled.clear();
}
