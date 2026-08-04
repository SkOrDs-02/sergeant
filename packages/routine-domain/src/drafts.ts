/**
 * Habit-draft utilities used by `HabitForm` (web) and the upcoming
 * mobile equivalent — pure, no DOM / storage.
 *
 * Extracted from `apps/web/src/modules/routine/lib/routineDraftUtils.ts`
 * (Phase 5 / PR 2). Behaviour is unchanged; TypeScript signatures
 * were tightened for cross-platform consumers.
 */

import { dateKeyFromDate } from "./dateKeys.js";
import { DEFAULT_ROUTINE_GLYPH, resolveHabitGlyph } from "./glyphs.js";
import type {
  Habit,
  HabitDraft,
  HabitDraftPatch,
  ReminderPreset,
} from "./types.js";

/**
 * Inline validation errors surfaced by `HabitForm` next to the offending
 * field (red border + message).
 *
 * Extracted from `apps/web/src/modules/routine/components/settings/
 * HabitForm.tsx` (Phase 5 / PR 3 — Habits editor on mobile). Kept in
 * the domain package so both `apps/web` and `apps/mobile` share the
 * exact same validation contract and error copy.
 */
export interface HabitFormErrors {
  name?: string;
  weekdays?: string;
}

export function routineTodayDate(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

export const REMINDER_PRESETS: readonly ReminderPreset[] = [
  { id: "morning", label: "Ранок", times: ["08:00"] },
  { id: "afternoon", label: "День", times: ["13:00"] },
  { id: "evening", label: "Вечір", times: ["20:00"] },
  { id: "twice", label: "Ранок + Вечір", times: ["08:00", "20:00"] },
  {
    id: "thrice",
    label: "Ранок / День / Вечір",
    times: ["08:00", "13:00", "20:00"],
  },
];

export function normalizeReminderTimes(
  habit: Pick<Habit, "reminderTimes" | "timeOfDay">,
): string[] {
  if (Array.isArray(habit.reminderTimes) && habit.reminderTimes.length > 0) {
    return habit.reminderTimes.filter(
      (t) => typeof t === "string" && /^\d{2}:\d{2}$/.test(t),
    );
  }
  const legacy = habit.timeOfDay && String(habit.timeOfDay).trim();
  if (legacy && /^\d{2}:\d{2}$/.test(legacy)) return [legacy];
  return [];
}

export function emptyHabitDraft(): HabitDraft {
  const t = routineTodayDate();
  return {
    name: "",
    emoji: DEFAULT_ROUTINE_GLYPH,
    tagIds: [],
    categoryId: null,
    recurrence: "daily",
    startDate: dateKeyFromDate(t),
    endDate: "",
    timeOfDay: "",
    reminderTimes: [],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    paused: false,
  };
}

export function habitDraftToPatch(draft: HabitDraft): HabitDraftPatch {
  const tagIds = draft.tagIds || [];
  const reminderTimes = (draft.reminderTimes || [])
    .map((t) =>
      String(t || "")
        .trim()
        .slice(0, 5),
    )
    .filter((t) => /^\d{2}:\d{2}$/.test(t));

  const timeOfDay =
    reminderTimes[0] ||
    (draft.timeOfDay && String(draft.timeOfDay).trim()
      ? String(draft.timeOfDay).trim().slice(0, 5)
      : "");

  return {
    name: draft.name.trim(),
    emoji: resolveHabitGlyph(draft.emoji),
    tagIds,
    categoryId: draft.categoryId || null,
    recurrence: draft.recurrence || "daily",
    startDate: draft.startDate || dateKeyFromDate(routineTodayDate()),
    endDate:
      draft.endDate && String(draft.endDate).trim()
        ? String(draft.endDate).trim()
        : null,
    timeOfDay,
    reminderTimes,
    weekdays: Array.isArray(draft.weekdays)
      ? draft.weekdays
      : [0, 1, 2, 3, 4, 5, 6],
    paused: draft.paused === true,
  };
}

/**
 * Load an existing habit into a fully-populated `HabitDraft` so the
 * form renders controlled inputs.
 *
 * Mirrors `loadHabitIntoDraft` from the web
 * `RoutineSettingsSection` so switching between "new" and "edit" modes
 * is platform-agnostic.
 */
export function habitToDraft(h: Habit): HabitDraft {
  const reminderTimes = normalizeReminderTimes(h);
  const weekdays =
    Array.isArray(h.weekdays) && h.weekdays.length > 0
      ? [...h.weekdays]
      : [0, 1, 2, 3, 4, 5, 6];
  return {
    name: h.name || "",
    emoji: resolveHabitGlyph(h.emoji),
    tagIds: Array.isArray(h.tagIds) ? [...h.tagIds] : [],
    categoryId: h.categoryId || null,
    recurrence: h.recurrence || "daily",
    startDate: h.startDate || dateKeyFromDate(routineTodayDate()),
    endDate: h.endDate || "",
    timeOfDay: h.timeOfDay || "",
    reminderTimes,
    weekdays,
    paused: h.paused === true,
  };
}

/**
 * Inline validator for `HabitForm`. Returns a `HabitFormErrors` object
 * — empty when the draft is valid. Callers decide whether to render
 * the errors, re-focus the offending field, etc.
 *
 * Rules (mirror web `HabitForm` inline validation):
 *   - `name` must be non-empty after trim.
 *   - When `recurrence === "weekly"`, at least one weekday must be
 *     selected.
 */
export function validateHabitDraft(draft: HabitDraft): HabitFormErrors {
  const errors: HabitFormErrors = {};
  const patch = habitDraftToPatch(draft);
  if (!patch.name) {
    errors.name = "Додай назву звички.";
  }
  if (
    patch.recurrence === "weekly" &&
    (!patch.weekdays || patch.weekdays.length === 0)
  ) {
    errors.weekdays = "Обери хоча б один день тижня.";
  }
  return errors;
}

/** Convenience: `true` if there are no validation errors. */
export function isHabitDraftValid(draft: HabitDraft): boolean {
  const errors = validateHabitDraft(draft);
  return !errors.name && !errors.weekdays;
}
