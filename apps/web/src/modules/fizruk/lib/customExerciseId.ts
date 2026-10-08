/**
 * Last validated: 2026-10-03
 * Status: Active
 *
 * Генератор id користувацької вправи — один на `AddExerciseSheet` (UI) і на
 * чат-екзекутори (`log_set` / `plan_workout`, data-11): обидва шляхи мусять
 * давати вправі той самий вигляд id, а не розходитись у двох копіях.
 *
 * AI-CONTEXT: id — `custom_<uuid>` (`crypto.randomUUID()`), а не slug назви чи
 * `Date.now()`. `fizruk_custom_exercises` має ГЛОБАЛЬНИЙ PK `(id)` без
 * `user_id`, тож передбачуваний id (`custom_hip_thrust`, `custom_5`,
 * мілісекунда) збігається з чужим рядком, і сервер термінально відхиляє запис
 * `fk_violation` (аудит data-01, крок 1). Префікс `custom_` лишається:
 * `ExerciseDetailSheet` відрізняє свою вправу за ним.
 *
 * Дедуплікація «та сама назва = та сама вправа» раніше трималась на slug-id
 * (повторне додавання «Hip Thrust» перезаписувало запис). Тепер id випадковий,
 * тож порівняння йде за нормалізованою назвою: `isSameExerciseName` +
 * `useExerciseCatalog.addExercise`.
 */
import { generatePrefixedId } from "@sergeant/shared";

/** `custom_<uuid>` — непередбачуваний, унікальний між користувачами. */
export function newCustomExerciseId(): string {
  return generatePrefixedId("custom");
}

function normalizeName(s: string | null | undefined): string {
  return (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}

/** Назви збігаються без урахування регістру й зайвих пробілів. */
export function isSameExerciseName(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeName(a);
  return na.length > 0 && na === normalizeName(b);
}
