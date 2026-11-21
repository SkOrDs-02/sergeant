import type { HabitDraftPatch } from "./types";

/**
 * Поля, де порядок не несе змісту: перемкнутий туди-назад тег чи день тижня
 * не рахується правкою.
 */
const SET_LIKE_FIELDS: ReadonlySet<keyof HabitDraftPatch> = new Set([
  "tagIds",
  "weekdays",
]);

function comparable(key: keyof HabitDraftPatch, value: unknown): string {
  if (SET_LIKE_FIELDS.has(key) && Array.isArray(value)) {
    return JSON.stringify(value.map(String).sort());
  }
  return JSON.stringify(value ?? null);
}

/**
 * Лише ті поля патча форми, які людина справді змінила відносно значень,
 * з якими форма відкрилась (аудит `data-61`).
 *
 * AI-CONTEXT: форма редагування засівається один раз на відкриття і не бачить
 * змін під собою. Повний патч з усіма полями, накладений на свіжий стан,
 * відкочував правки з іншого пристрою, що встигли приїхати pull-ом (назва,
 * теги, нагадування), а sync шле рядок цілком і сервер робить per-row LWW.
 * Тому до стану йдуть тільки змінені поля; решта береться зі свіжої звички.
 * Рішення власника 2026-11-21: field-level, без діалогу «оновити?».
 */
export function changedHabitFields(
  base: HabitDraftPatch,
  next: HabitDraftPatch,
): HabitDraftPatch {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(next) as Array<keyof HabitDraftPatch>) {
    if (comparable(key, next[key]) !== comparable(key, base[key])) {
      out[key] = next[key];
    }
  }
  return out as HabitDraftPatch;
}
