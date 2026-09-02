/**
 * Last validated: 2026-09-01
 * Status: Active
 *
 * Хелпери `routineActions.ts`, винесені за Hard Rule #18 (600 рядків):
 * нормалізація вхідних даних від моделі (дні тижня, `id:`-префікси, ключі
 * дат) і константи тижня.
 */

export const DAY_MS = 86_400_000;

// Mon-first 0..6 — matches `@sergeant/routine-domain` `isoWeekdayFromDateKey`
// and `WEEKDAY_LABELS`. Both English short names and Ukrainian short names
// are accepted from the LLM tool input.
export const DAY_NAME_TO_INDEX: Readonly<Record<string, number>> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
  пн: 0,
  вт: 1,
  ср: 2,
  чт: 3,
  пт: 4,
  сб: 5,
  нд: 6,
};

export const WEEKDAY_LABEL_UK: readonly string[] = [
  "Пн",
  "Вт",
  "Ср",
  "Чт",
  "Пт",
  "Сб",
  "Нд",
];

export function normalizeDayToken(token: unknown): number | null {
  if (typeof token !== "string") return null;
  const key = token.trim().toLowerCase();
  if (!key) return null;
  const idx = DAY_NAME_TO_INDEX[key];
  return typeof idx === "number" ? idx : null;
}

/**
 * Normalize a habit id from LLM tool input. The model frequently echoes ids
 * with an `id:` prefix because list/query results elsewhere render entities as
 * `Name (id:hab-…)`. Strip that prefix (and whitespace) so the id matches the
 * canonical `habit.id`. Without this, completion writes land under a phantom
 * key and never surface in the module (QA D-005).
 */
export function normalizeHabitId(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/^id:\s*/i, "")
    .trim();
}

/** Вузький гейт на `YYYY-MM-DD` — модель інколи шле «завтра» словами. */
export function isDateKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}
