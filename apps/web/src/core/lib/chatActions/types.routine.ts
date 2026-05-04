/**
 * Routine-доменні chat-action payload-и (habits + calendar) + HabitState.
 * Виокремлено з `types.ts` (initiative 0001 Phase 2).
 */

// ─── Action payload-и ──────────────────────────────────────────────────────

export interface MarkHabitDoneAction {
  name: "mark_habit_done";
  input: { habit_id: string; date?: string };
}

export interface CreateHabitAction {
  name: "create_habit";
  input: {
    name: string;
    emoji?: string;
    recurrence?: string;
    weekdays?: number[];
    time_of_day?: string;
  };
}

export interface CreateReminderAction {
  name: "create_reminder";
  input: { habit_id: string; time: string };
}

export interface CompleteHabitForDateAction {
  name: "complete_habit_for_date";
  input: { habit_id: string; date: string; completed?: boolean };
}

export interface ArchiveHabitAction {
  name: "archive_habit";
  input: { habit_id: string; archived?: boolean };
}

export interface AddCalendarEventAction {
  name: "add_calendar_event";
  input: { name: string; date: string; time?: string; emoji?: string };
}

export interface EditHabitAction {
  name: "edit_habit";
  input: {
    habit_id: string;
    name?: string;
    emoji?: string;
    recurrence?: string;
    weekdays?: number[];
  };
}

export interface ReorderHabitsAction {
  name: "reorder_habits";
  input: { habit_ids: string[] };
}

export interface HabitStatsAction {
  name: "habit_stats";
  input: { habit_id: string; period_days?: number | string };
}

export interface SetHabitScheduleAction {
  name: "set_habit_schedule";
  input: { habit_id: string; days: string[] };
}

export interface PauseHabitAction {
  name: "pause_habit";
  input: { habit_id: string; paused?: boolean };
}

export interface HabitTrendAction {
  name: "habit_trend";
  input: { habit_id?: string; period_days?: number | string };
}

// ─── Domain entities (зберігаються в localStorage) ──────────────────────────

export interface HabitState {
  habits: Array<{ id: string; name?: string; emoji?: string }>;
  completions: Record<string, string[]>;
}
