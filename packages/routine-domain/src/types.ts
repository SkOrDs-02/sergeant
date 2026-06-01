/**
 * Core domain types for the Routine module.
 *
 * Extracted from `apps/web/src/modules/routine/lib/types.ts` verbatim
 * (Phase 5 / PR 2 — pure-domain split). Consumed by both `apps/web` and
 * `apps/mobile` via `@sergeant/routine-domain`.
 */

export type Recurrence = "daily" | "weekdays" | "weekly" | "monthly" | "once";

export interface Habit {
  id: string;
  name: string;
  emoji?: string | undefined;
  tagIds?: string[] | undefined;
  categoryId?: string | null | undefined;
  createdAt?: string | undefined;
  archived?: boolean | undefined;
  paused?: boolean | undefined;
  recurrence?: Recurrence | string | undefined;
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
  timeOfDay?: string | undefined;
  reminderTimes?: string[] | undefined;
  weekdays?: number[] | undefined;
}

export interface Tag {
  id: string;
  name: string;
  scope?: string | undefined;
}

export interface Category {
  id: string;
  name: string;
  emoji?: string | undefined;
}

export interface RoutinePrefs {
  showFizrukInCalendar?: boolean | undefined;
  showFinykSubscriptionsInCalendar?: boolean | undefined;
  routineRemindersEnabled?: boolean | undefined;
  [k: string]: unknown;
}

export interface RoutineState {
  schemaVersion: number;
  prefs: RoutinePrefs;
  tags: Tag[];
  categories: Category[];
  habits: Habit[];
  completions: Record<string, string[]>;
  pushupsByDate: Record<string, number>;
  habitOrder: string[];
  completionNotes: Record<string, string>;
}

export interface HabitDraftPatch {
  name?: string | undefined;
  emoji?: string | undefined;
  tagIds?: string[] | undefined;
  categoryId?: string | null | undefined;
  recurrence?: Recurrence | string | undefined;
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
  timeOfDay?: string | undefined;
  reminderTimes?: string[] | undefined;
  weekdays?: number[] | undefined;
  paused?: boolean | undefined;
}

/**
 * Full habit draft used by HabitForm. All fields are defined (possibly
 * empty strings / empty arrays) so inputs are always controlled.
 */
export interface HabitDraft {
  name: string;
  emoji: string;
  tagIds: string[];
  categoryId: string | null;
  recurrence: Recurrence | string;
  startDate: string;
  endDate: string;
  timeOfDay: string;
  reminderTimes: string[];
  weekdays: number[];
  paused: boolean;
}

export interface ReminderPreset {
  id: string;
  label: string;
  times: string[];
}

export interface CategoryDraft {
  name: string;
  emoji: string;
}

export interface PendingHabitDeletion {
  id: string;
  name: string;
  archived: boolean;
}

export interface PendingCategoryDeletion {
  id: string;
  name: string;
  habitCount: number;
}

export interface CreateHabitOptions extends HabitDraftPatch {
  name: string;
}

export interface CalendarRange {
  startKey: string;
  endKey: string;
}

export interface HubCalendarEvent {
  id: string;
  source: string;
  date: string;
  title: string;
  subtitle: string;
  tagLabels: string[];
  sortKey: string;
  fizruk?: boolean;
  finykSub?: boolean;
  sourceKind: string;
  habitId?: string;
  completed?: boolean;
  note?: string;
  timeOfDay?: string;
}
