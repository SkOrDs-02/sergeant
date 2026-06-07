import { describe, expect, it, vi } from "vitest";

import {
  ROUTINE_SCHEMA_VERSION,
  defaultRoutineState,
  ensureHabitOrder,
  normalizeCompletionList,
  normalizeCompletionsMap,
  normalizeHabit,
  normalizeReminderTimesStorage,
  normalizeRoutineState,
  parseRoutineState,
  routineUid,
  serializeRoutineState,
} from "./storage.js";
import type { Habit, RoutineState } from "./types.js";

function habit(partial: Partial<Habit>): Habit {
  return {
    id: "h1",
    name: "Habit",
    archived: false,
    recurrence: "daily",
    startDate: "2026-01-01",
    endDate: null,
    ...partial,
  };
}

function state(partial: Partial<RoutineState> = {}): RoutineState {
  return {
    ...defaultRoutineState(),
    ...partial,
  };
}

describe("routine-domain/storage", () => {
  it("generates stable-shape ids with the requested prefix", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);

    expect(routineUid("habit")).toBe("habit_loyw3v28_4fzzzxj");

    vi.restoreAllMocks();
  });

  it("normalizes reminder times and completion maps", () => {
    expect(
      normalizeReminderTimesStorage(["08:00", "bad", 12, "20:30"]),
    ).toEqual(["08:00", "20:30"]);
    expect(normalizeReminderTimesStorage("08:00")).toEqual([]);
    expect(
      normalizeCompletionList([
        "2026-01-02",
        "nope",
        "2026-01-01",
        "2026-01-02",
      ]),
    ).toEqual(["2026-01-01", "2026-01-02"]);
    expect(normalizeCompletionList("2026-01-01")).toEqual([]);
    expect(
      normalizeCompletionsMap({
        h1: ["2026-01-02", "2026-01-01"],
        h2: "bad",
      }),
    ).toEqual({ h1: ["2026-01-01", "2026-01-02"], h2: [] });
    expect(normalizeCompletionsMap(null)).toEqual({});
    expect(normalizeCompletionsMap([])).toEqual({});
  });

  it("normalizes habit defaults from createdAt and invalid optional arrays", () => {
    expect(
      normalizeHabit({
        id: "h1",
        name: "Habit",
        createdAt: "2026-02-03T10:00:00.000Z",
        reminderTimes: ["08:00", "bad"],
        weekdays: [],
      }),
    ).toMatchObject({
      recurrence: "daily",
      startDate: "2026-02-03",
      endDate: null,
      timeOfDay: "",
      reminderTimes: ["08:00"],
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    });

    expect(
      normalizeHabit({
        id: "h2",
        name: "Timed",
        startDate: "2026-01-05",
        endDate: "2026-01-10",
        timeOfDay: 930,
        weekdays: [0, 2],
      }),
    ).toMatchObject({
      startDate: "2026-01-05",
      endDate: "2026-01-10",
      timeOfDay: "930",
      weekdays: [0, 2],
    });
  });

  it("returns fresh default state objects", () => {
    const a = defaultRoutineState();
    const b = defaultRoutineState();

    a.habits.push(habit({ id: "mutated" }));

    expect(b.habits).toEqual([]);
    expect(b.schemaVersion).toBe(ROUTINE_SCHEMA_VERSION);
  });

  it("ensures habitOrder references active habits exactly once", () => {
    const input = state({
      habits: [
        habit({ id: "b" }),
        habit({ id: "a" }),
        habit({ id: "archived", archived: true }),
      ],
      habitOrder: ["missing", "a", "archived"],
    });

    const result = ensureHabitOrder(input);

    expect(result.changed).toBe(true);
    expect(result.state.habitOrder).toEqual(["a", "b"]);

    const stable = ensureHabitOrder(
      state({ habits: [habit({ id: "a" })], habitOrder: ["a"] }),
    );
    expect(stable.changed).toBe(false);
    expect(stable.state.habitOrder).toEqual(["a"]);
  });

  it("normalizes routine state with defensive defaults", () => {
    const normalized = normalizeRoutineState({
      prefs: { routineRemindersEnabled: true },
      tags: "bad",
      categories: [{ id: "cat", name: "Category" }],
      habits: [
        {
          id: "h1",
          name: "Habit",
          createdAt: "2026-01-05T00:00:00.000Z",
          reminderTimes: ["08:00"],
        },
      ],
      completions: { h1: ["2026-01-06", "bad"] },
      pushupsByDate: null,
      habitOrder: "bad",
      completionNotes: { "h1__2026-01-06": "Good" },
    });

    expect(normalized.prefs).toMatchObject({
      showFizrukInCalendar: true,
      showFinykSubscriptionsInCalendar: true,
      routineRemindersEnabled: true,
    });
    expect(normalized.tags).toEqual([]);
    expect(normalized.categories).toEqual([{ id: "cat", name: "Category" }]);
    expect(normalized.habits[0]).toMatchObject({
      id: "h1",
      startDate: "2026-01-05",
      reminderTimes: ["08:00"],
    });
    expect(normalized.completions).toEqual({ h1: ["2026-01-06"] });
    expect(normalized.pushupsByDate).toEqual({});
    expect(normalized.habitOrder).toEqual([]);
    expect(normalized.completionNotes).toEqual({ "h1__2026-01-06": "Good" });
  });

  it("parses and serializes routine state safely", () => {
    const parsed = parseRoutineState(
      JSON.stringify({
        prefs: { routineRemindersEnabled: true },
        habits: [{ id: "h1", name: "Habit", startDate: "2026-01-01" }],
      }),
    );

    expect(parsed.prefs.routineRemindersEnabled).toBe(true);
    expect(parsed.habits[0]?.startDate).toBe("2026-01-01");
    expect(parseRoutineState(null)).toEqual(defaultRoutineState());
    expect(parseRoutineState(undefined)).toEqual(defaultRoutineState());
    expect(parseRoutineState("{")).toEqual(defaultRoutineState());
    expect(parseRoutineState("[]")).toEqual(defaultRoutineState());
    expect(serializeRoutineState(parsed)).toBe(JSON.stringify(parsed));
  });
});
