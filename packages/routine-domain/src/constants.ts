/**
 * Pure data-only constants for the Routine module.
 *
 * Split out of `apps/web/src/modules/routine/lib/routineConstants.ts`
 * (Phase 5 / PR 2) — the original file also exports the web-only
 * `ROUTINE_THEME` Tailwind-class map, which stays put on web because
 * its class strings are tightly coupled to the web `tailwind.config.js`
 * and semantic tokens. The symbols below are plain data / types and
 * are safe to consume from both `apps/web` and `apps/mobile`.
 */

export type RoutineTimeModeId = "today" | "tomorrow" | "week" | "month";

export interface RoutineTimeMode {
  id: RoutineTimeModeId;
  label: string;
}

export const ROUTINE_TIME_MODES: readonly RoutineTimeMode[] = [
  { id: "today", label: "Сьогодні" },
  { id: "tomorrow", label: "Завтра" },
  { id: "week", label: "Тиждень" },
  { id: "month", label: "Місяць" },
];

export interface RecurrenceOption {
  value: "daily" | "weekdays" | "weekly" | "monthly" | "once" | "flexible";
  label: string;
  /**
   * Compact label used by the segmented chip row in `HabitForm`.
   * Falls back to `label` when omitted. Full `label` is still used in
   * any remaining `<option>` contexts so existing selects don't lose
   * their clarifying copy.
   */
  shortLabel?: string;
}

export const RECURRENCE_OPTIONS: readonly RecurrenceOption[] = [
  { value: "daily", label: "Щодня" },
  { value: "weekdays", label: "Будні (пн-пт)", shortLabel: "Будні" },
  { value: "weekly", label: "Обрані дні тижня", shortLabel: "По тижню" },
  {
    value: "flexible",
    label: "N разів на тиждень",
    shortLabel: "Разів/тиждень",
  },
  {
    value: "monthly",
    label: "Щомісяця (число; лютий - останній день)",
    shortLabel: "Щомісяця",
  },
  { value: "once", label: "Одноразово (одна дата)", shortLabel: "Одноразово" },
];

/** Weekday labels (Ukrainian, Monday first). */
export const WEEKDAY_LABELS: readonly string[] = [
  "Пн",
  "Вт",
  "Ср",
  "Чт",
  "Пт",
  "Сб",
  "Нд",
];
