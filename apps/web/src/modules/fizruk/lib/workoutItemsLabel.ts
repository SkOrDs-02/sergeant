/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Число вправ минулого чи завершуваного тренування одним рядком. Діалог
 * «Завершити зараз?», історія й «Останні» показували голе `items.length`
 * («2 вправи»), а підсумок той самий запис — «Вправ 1 з 2» (рішення
 * founder-а 2026-11-18). Тепер усі беруть `computeWorkoutDoneItemCount`
 * (предикат `isSetCompleted`) і форму підсумку: одне число, коли зроблено
 * всі, «N з M», коли ні.
 */
import { pluralExercises, pluralUa } from "@sergeant/shared";
import {
  computeWorkoutDoneItemCount,
  type WorkoutSummaryInput,
} from "@sergeant/fizruk-domain/domain";
import { messages } from "@shared/i18n/uk";

export function formatWorkoutItemsCount(done: number, total: number): string {
  if (done >= total) return `${total} ${pluralExercises(total)}`;
  const c = messages.fizruk.workoutItemsCount;
  return c.doneOf
    .replace("{done}", String(done))
    .replace("{total}", String(total))
    .replace(
      "{noun}",
      pluralUa(total, { one: c.ofOne, few: c.ofMany, many: c.ofMany }),
    );
}

export function workoutItemsLabel(
  w: WorkoutSummaryInput | null | undefined,
): string {
  return formatWorkoutItemsCount(
    computeWorkoutDoneItemCount(w),
    (w?.items || []).length,
  );
}
