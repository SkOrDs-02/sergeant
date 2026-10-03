/**
 * Last validated: 2026-10-03
 * Status: Active
 *
 * Генератор id користувацької вправи — один на `AddExerciseSheet` (UI) і на
 * чат-екзекутори (`log_set` / `plan_workout`, data-11): обидва шляхи мусять
 * давати вправі той самий вигляд id, а не розходитись у двох копіях.
 *
 * AI-CONTEXT: slug бере лише `[a-z0-9]`, тож кирилична назва дає порожній
 * slug, і id стає `custom_<Date.now()>`. Латинські назви дають детермінований
 * `custom_<slug>`, який може збігтись у двох акаунтів (глобальний PK
 * `fizruk_custom_exercises`, див. аудит data-01) — це відома межа генератора,
 * не нова.
 */

export function slugifyExerciseName(s: string | null | undefined): string {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** `custom_<slug>` або `custom_<Date.now()>`, коли slug порожній. */
export function customExerciseIdFromName(nameUk: string): string {
  return `custom_${slugifyExerciseName(nameUk) || Date.now()}`;
}
