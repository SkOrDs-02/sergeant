/**
 * Habit-draft utilities — moved into `@sergeant/routine-domain`
 * (Phase 5 / PR 2). Re-exports here keep the historical import path
 * stable for the existing `HabitForm` + callers in `apps/web`.
 */

export {
  REMINDER_PRESETS,
  emptyHabitDraft,
  habitDraftToPatch,
  matchReminderPreset,
  normalizeReminderTimes,
  routineTodayDate,
} from "@sergeant/routine-domain";
