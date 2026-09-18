/**
 * Core domain types for the Routine module.
 *
 * Moved into the DOM-free `@sergeant/routine-domain` package (Phase 5 /
 * PR 2). This file thinly re-exports those types under the historical
 * import paths so that existing `apps/web` call-sites don't need to
 * change.
 */

export type {
  Category,
  CategoryDraft,
  CalendarRange,
  CreateHabitOptions,
  Habit,
  HabitDraft,
  HabitDraftPatch,
  HubCalendarEvent,
  PendingCategoryDeletion,
  PendingHabitDeletion,
  Recurrence,
  ReminderPreset,
  RoutinePrefs,
  RoutineState,
  Tag,
} from "@sergeant/routine-domain";
