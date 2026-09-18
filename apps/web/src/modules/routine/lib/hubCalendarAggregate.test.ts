import { describe, expect, it } from "vitest";
import { buildHubCalendarEvents } from "./hubCalendarAggregate";
import type { RoutineState } from "./types";

describe("buildHubCalendarEvents", () => {
  it("додає подію звички на кожен день діапазону", () => {
    const state: RoutineState = {
      schemaVersion: 1,
      prefs: {
        showFinykSubscriptionsInCalendar: false,
      },
      tags: [],
      categories: [],
      habits: [
        {
          id: "h1",
          name: "Вода",
          emoji: "💧",
          archived: false,
          recurrence: "daily",
          startDate: "2025-06-01",
          endDate: null,
          tagIds: [],
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          timeOfDay: "",
        },
      ],
      completions: { h1: ["2025-06-10"] },
      habitOrder: ["h1"],
      completionNotes: {},
    };
    const events = buildHubCalendarEvents(
      state,
      { startKey: "2025-06-10", endKey: "2025-06-11" },
      { showFizruk: false, showFinykSubs: false },
    );
    const habitEv = events.filter((e) => e.habitId === "h1");
    expect(habitEv.length).toBe(2);
    expect(habitEv.find((e) => e.date === "2025-06-10")?.completed).toBe(true);
    expect(habitEv.find((e) => e.date === "2025-06-11")?.completed).toBe(false);
  });
});
