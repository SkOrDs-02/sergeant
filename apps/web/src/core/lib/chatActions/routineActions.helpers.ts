/**
 * Last validated: 2026-09-01
 * Status: Active
 *
 * Хелпери `routineActions.ts`, винесені за Hard Rule #18 (600 рядків):
 * нормалізація вхідних даних від моделі (дні тижня, `id:`-префікси, ключі
 * дат) і константи тижня.
 */

import { habitCompletionRate, type Habit } from "@sergeant/routine-domain";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { formatNumberUk } from "@sergeant/shared";

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

/**
 * Текст `habit_trend`: тижневі відсотки по всіх обраних звичках і, коли
 * звичок кілька, розбивка по кожній. Без розбивки модель на питання «яка
 * звичка тягне вниз» не мала з чого відповісти, і синтез повертав порожній
 * текст (живий прогін 2026-09-28).
 */
export function habitTrendText(
  habits: readonly Habit[],
  completions: Readonly<Record<string, string[] | undefined>>,
  days: number,
  now: number,
): string {
  const weeklyData: number[] = [];
  for (let w = 0; w < Math.ceil(days / 7); w++) {
    let done = 0;
    let possible = 0;
    for (let d = 0; d < 7; d++) {
      const dayOffset = w * 7 + d;
      if (dayOffset >= days) break;
      const dk = getKyivDayKey(now - dayOffset * DAY_MS);
      for (const h of habits) {
        possible++;
        if (completions[h.id]?.includes(dk)) done++;
      }
    }
    weeklyData.push(possible > 0 ? Math.round((done / possible) * 100) : 0);
  }
  weeklyData.reverse();
  const parts = [
    `Тренд звичок за ${days} днів (${habits.length} звичок):`,
    ...weeklyData.map(
      (pct, i) => `  Тиждень ${i + 1}: ${formatNumberUk(pct)}%`,
    ),
  ];
  const first = weeklyData[0];
  const last = weeklyData[weeklyData.length - 1];
  if (weeklyData.length >= 2 && first !== undefined && last !== undefined) {
    const trend =
      last > first
        ? "покращується"
        : last < first
          ? "погіршується"
          : "стабільно";
    parts.push(
      `Тренд: ${trend} (${formatNumberUk(first)}% → ${formatNumberUk(last)}%)`,
    );
  }
  if (habits.length > 1) {
    const todayKey = getKyivDayKey(now);
    const startKey = getKyivDayKey(now - (days - 1) * DAY_MS);
    parts.push("По звичках:");
    for (const h of habits) {
      const { completed, scheduled } = habitCompletionRate(
        h,
        completions[h.id],
        startKey,
        todayKey,
      );
      const pct = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
      parts.push(
        `  ${h.name || h.id}: ${completed}/${scheduled} (${formatNumberUk(pct)}%)`,
      );
    }
  }
  return parts.join("\n");
}
