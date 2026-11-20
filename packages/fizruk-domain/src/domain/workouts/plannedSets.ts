/**
 * Заплановані, але ще не зроблені підходи.
 *
 * AI-CONTEXT: план живе як порожні рядки `{вага плану, 0}`, а не як рядки з
 * повтореннями. Зарахованість похідна від повторень (`isSetCompleted`,
 * `setCompletion.ts`), тож рядок із повтореннями «з плану» одразу йшов би в
 * лічильник сесії, обʼєм, рекорди, відновлення і стрік, хоча людина ще нічого
 * не зробила (так було з чат-інструментом `plan_workout`, OD-28 Фз-4). Вага
 * плану в рядку лишається: це ціль, а не факт, і без повторень вона не
 * зарахована. З явним прапорцем (Фз-3 (в)) повтори плану в рядок пишуться
 * лише разом із `done: false` — див. `PlannedSetValues`.
 */

import type { WorkoutSet } from "../types.js";

/**
 * Значення плану в рядку (дефолт П-Фз3-5 (А) від 2026-11-19, спека
 * `fizruk-set-done-flag-and-set-type.md`). З ними рядок несе `done: false`:
 * повтори чи секунди плану — ціль, а не факт, і зарахованим рядок стає лише
 * після ✓ (`isSetCompleted`: прапорець `false` прибирає рядок із підрахунку).
 */
export interface PlannedSetValues {
  readonly reps?: number | undefined;
  readonly durationSec?: number | undefined;
}

function positiveInt(n: unknown): number | null {
  const x = Number(n);
  return Number.isFinite(x) && x > 0 ? Math.round(x) : null;
}

/**
 * `count` рядків із вагою `weightKg`. Без `values` — як до прапорця: нуль
 * повторень і без `done` (чат `plan_workout`, старі виклики). З `values` —
 * повтори / секунди плану і `done: false`. Дробова кількість округлюється
 * вниз; некоректна або <1 дає порожній масив, вага поза діапазоном стає 0.
 */
export function buildPlannedSets(
  count: number,
  weightKg = 0,
  values?: PlannedSetValues,
): WorkoutSet[] {
  const n = Number.isFinite(count) ? Math.floor(count) : 0;
  if (n < 1) return [];
  const w = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 0;
  if (!values)
    return Array.from({ length: n }, () => ({ weightKg: w, reps: 0 }));
  const reps = positiveInt(values.reps) ?? 0;
  const sec = positiveInt(values.durationSec);
  return Array.from({ length: n }, () => ({
    weightKg: w,
    reps,
    ...(sec !== null ? { durationSec: sec } : {}),
    done: false,
  }));
}
