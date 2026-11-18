/**
 * Заплановані, але ще не зроблені підходи.
 *
 * AI-CONTEXT: план живе як порожні рядки `{вага плану, 0}`, а не як рядки з
 * повтореннями. Зарахованість похідна від повторень (`isSetCompleted`,
 * `setCompletion.ts`), тож рядок із повтореннями «з плану» одразу йшов би в
 * лічильник сесії, обʼєм, рекорди, відновлення і стрік, хоча людина ще нічого
 * не зробила (так було з чат-інструментом `plan_workout`, OD-28 Фз-4). Вага
 * плану в рядку лишається: це ціль, а не факт, і без повторень вона не
 * зарахована. Повтори плану в рядок не пишемо.
 */

import type { WorkoutSet } from "../types.js";

/**
 * `count` порожніх рядків із вагою `weightKg` і нулем повторень. Дробова
 * кількість округлюється вниз; некоректна або <1 дає порожній масив, вага
 * поза діапазоном стає 0.
 */
export function buildPlannedSets(count: number, weightKg = 0): WorkoutSet[] {
  const n = Number.isFinite(count) ? Math.floor(count) : 0;
  if (n < 1) return [];
  const w = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 0;
  return Array.from({ length: n }, () => ({ weightKg: w, reps: 0 }));
}
