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

// ---------------------------------------------------------------------
// Append-only журнал відміток (W1-ROUTINE-APPEND, стадія 1)
// ---------------------------------------------------------------------

/** Стан відмітки, який зафіксувала подія. */
export type CompletionEventState = "done" | "undone";

/**
 * Як саме клієнт порахував `dateKey` події.
 *
 * `unknown` — для синтетичних подій backfill-у (стадія 2): вони НЕ мають
 * права вдавати, ніби знають доктрину. Рішення Kyiv vs device-local
 * (задача W1-TIME-DOCTRINE) ухвалюється окремо і може бути переграним
 * із сирих полів події.
 */
export type CompletionDayAnchor = "device-local" | "kyiv" | "unknown";

/** Звідки прилетіла подія. */
export type CompletionEventSource =
  "ui" | "chat" | "bulk" | "backfill" | "seed";

/**
 * Одна незмінна подія журналу відміток.
 *
 * AI-CONTEXT: подія несе І `dateKey` (як його порахував клієнт), І сирі
 * `occurredAt` + `tzOffsetMin` + `dayAnchor`. Це навмисне дублювання:
 * ключ — те, що бачив користувач, сирий момент — те, з чого майбутній
 * derive зможе перерахувати ключ за іншою доктриною.
 *
 * Подія НЕ редагується і НЕ видаляється (append-only). Виправлення
 * історії — це нова подія з новішим `occurredAt`.
 */
export interface CompletionEvent {
  readonly id: string;
  readonly habitId: string;
  readonly dateKey: string;
  readonly state: CompletionEventState;
  /** ISO-8601 з offset — реальний момент дії користувача. */
  readonly occurredAt: string;
  /** Зсув таймзони пристрою у хвилинах; `null` якщо невідомий. */
  readonly tzOffsetMin: number | null;
  readonly dayAnchor: CompletionDayAnchor;
  readonly source: CompletionEventSource;
  readonly deviceId: string | null;
}

/**
 * Результат згортки журналу — та сама форма, що й `RoutineState.completions`
 * (`habitId → відсортовані dateKey`). Окремий alias, щоб у сигнатурах було
 * видно, що значення ПОХІДНЕ від подій, а не збережений стан.
 */
export type FoldedCompletions = Record<string, string[]>;

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
  /**
   * Client-generated id. When supplied, `applyCreateHabit` is idempotent:
   * a repeat call with the same id (double-tapped save, replayed offline
   * write) returns the state unchanged instead of creating a duplicate.
   */
  id?: string;
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
