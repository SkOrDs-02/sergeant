import { describe, expect, it } from "vitest";

import {
  ROUTINE_NOTIFY_PREFIX,
  buildReminderSchedule,
  habitShouldNotifyNow,
  isStaleNotifyKey,
  reminderDueNow,
  reminderNotifyKey,
} from "./reminders.js";
import type { Habit, RoutineState } from "./types.js";

function habit(partial: Partial<Habit>): Habit {
  return {
    id: "habit-1",
    name: "Stretch",
    emoji: "S",
    archived: false,
    recurrence: "daily",
    startDate: "2026-01-01",
    endDate: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    ...partial,
  };
}

function state(partial: Partial<RoutineState> = {}): RoutineState {
  return {
    schemaVersion: 3,
    prefs: {
      showFizrukInCalendar: true,
      showFinykSubscriptionsInCalendar: true,
      routineRemindersEnabled: true,
    },
    tags: [],
    categories: [],
    habits: [],
    completions: {},
    pushupsByDate: {},
    habitOrder: [],
    completionNotes: {},
    ...partial,
  };
}

describe("routine-domain/reminders", () => {
  it("returns no descriptors when reminders are disabled", () => {
    expect(
      buildReminderSchedule(
        state({
          prefs: { routineRemindersEnabled: false },
          habits: [habit({ reminderTimes: ["10:00"] })],
        }),
        { now: new Date(2026, 0, 5, 9, 0, 0, 0) },
      ),
    ).toEqual([]);
  });

  it("builds future reminders, skips past/completed/archived habits, and sorts by fire time", () => {
    const reminders = buildReminderSchedule(
      state({
        habits: [
          habit({
            id: "daily",
            name: "Daily",
            reminderTimes: ["08:00", "12:00", "bad"],
          }),
          habit({
            id: "legacy",
            name: "Legacy",
            reminderTimes: [],
            timeOfDay: "09:30",
          }),
          habit({
            id: "done",
            name: "Done",
            reminderTimes: ["13:00"],
          }),
          habit({
            id: "archived",
            archived: true,
            reminderTimes: ["14:00"],
          }),
        ],
        completions: { done: ["2026-01-05"] },
      }),
      { now: new Date(2026, 0, 5, 9, 0, 0, 0), daysAhead: 2 },
    );

    expect(
      reminders.map((reminder) => [
        reminder.habitId,
        reminder.dateKey,
        reminder.time,
      ]),
    ).toEqual([
      ["legacy", "2026-01-05", "09:30"],
      ["daily", "2026-01-05", "12:00"],
      ["daily", "2026-01-06", "08:00"],
      ["legacy", "2026-01-06", "09:30"],
      ["daily", "2026-01-06", "12:00"],
      ["done", "2026-01-06", "13:00"],
    ]);
    expect(
      reminders.find(
        (reminder) =>
          reminder.habitId === "daily" &&
          reminder.dateKey === "2026-01-05" &&
          reminder.time === "12:00",
      ),
    ).toMatchObject({
      title: "S Daily",
      notifyKey: reminderNotifyKey("daily", "12:00", "2026-01-05"),
    });
  });

  it("can include already-completed habits when requested", () => {
    const reminders = buildReminderSchedule(
      state({
        habits: [habit({ id: "done", reminderTimes: ["13:00"] })],
        completions: { done: ["2026-01-05"] },
      }),
      {
        now: new Date(2026, 0, 5, 9, 0, 0, 0),
        includeAlreadyCompleted: true,
      },
    );

    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.habitId).toBe("done");
  });

  it("respects weekly schedules and keeps daysAhead at one day minimum", () => {
    const reminders = buildReminderSchedule(
      state({
        habits: [
          habit({
            id: "weekly",
            recurrence: "weekly",
            weekdays: [1],
            reminderTimes: ["10:00"],
          }),
        ],
      }),
      { now: new Date(2026, 0, 5, 9, 0, 0, 0), daysAhead: 0 },
    );

    expect(reminders).toEqual([]);
  });

  it("builds stable notification keys", () => {
    expect(reminderNotifyKey("h1", "08:00", "2026-01-05")).toBe(
      `${ROUTINE_NOTIFY_PREFIX}h1_08:00_2026-01-05`,
    );
  });

  it("detects stale notification keys by date suffix only for routine keys", () => {
    const now = new Date(2026, 1, 20, 12, 0, 0, 0);

    expect(
      isStaleNotifyKey(reminderNotifyKey("h1", "08:00", "2026-01-01"), now, 30),
    ).toBe(true);
    expect(
      isStaleNotifyKey(reminderNotifyKey("h1", "08:00", "2026-02-01"), now, 30),
    ).toBe(false);
    expect(isStaleNotifyKey("other_2026-01-01", now, 30)).toBe(false);
    expect(isStaleNotifyKey(`${ROUTINE_NOTIFY_PREFIX}bad`, now, 30)).toBe(
      false,
    );
  });

  it("matches exact HH:MM reminder due time", () => {
    const now = new Date(2026, 0, 5, 8, 7, 30, 0);

    expect(reminderDueNow("08:07", now)).toBe(true);
    expect(reminderDueNow("08:08", now)).toBe(false);
  });

  it("decides whether a habit should notify now", () => {
    const now = new Date(2026, 0, 5, 10, 0, 0, 0);
    const active = habit({ reminderTimes: ["10:00"] });

    expect(habitShouldNotifyNow(active, [], now)).toEqual({
      should: true,
      dateKey: "2026-01-05",
      time: "10:00",
    });
    expect(habitShouldNotifyNow(active, ["2026-01-05"], now)).toBeNull();
    expect(
      habitShouldNotifyNow(
        habit({ archived: true, reminderTimes: ["10:00"] }),
        [],
        now,
      ),
    ).toBeNull();
    expect(
      habitShouldNotifyNow(
        habit({
          recurrence: "weekly",
          weekdays: [1],
          reminderTimes: ["10:00"],
        }),
        [],
        now,
      ),
    ).toBeNull();
    expect(
      habitShouldNotifyNow(habit({ reminderTimes: [] }), [], now),
    ).toBeNull();
    expect(
      habitShouldNotifyNow(habit({ reminderTimes: ["11:00"] }), [], now),
    ).toBeNull();
  });
});
