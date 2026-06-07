import { describe, expect, it } from "vitest";

import {
  FINYK_SUB_GROUP_LABEL,
  FIZRUK_GROUP_LABEL,
  buildFinykSubscriptionEvents,
  buildHubCalendarEvents,
  countEventsByDate,
} from "./calendarEvents.js";
import { completionNoteKey } from "./completionNoteKey.js";
import type { Habit, HubCalendarEvent, RoutineState } from "./types.js";

function habit(partial: Partial<Habit>): Habit {
  return {
    id: "habit-1",
    name: "Read",
    emoji: "R",
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
      routineRemindersEnabled: false,
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

function finykEvent(id: string, date: string): HubCalendarEvent {
  return {
    id,
    source: "finyk_subscription",
    date,
    title: id,
    subtitle: "",
    tagLabels: [FINYK_SUB_GROUP_LABEL],
    sortKey: `${date} 0b ${id}`,
    finykSub: true,
    sourceKind: "finyk_sub",
  };
}

describe("routine-domain/calendarEvents", () => {
  it("builds sorted habit and Fizruk events with tags, completion, and notes", () => {
    const noteKey = completionNoteKey("habit-1", "2026-01-05");
    const events = buildHubCalendarEvents(
      state({
        tags: [
          { id: "energy", name: "Energy" },
          { id: "missing", name: "Unused" },
        ],
        categories: [{ id: "mind", name: "Mind" }],
        habits: [
          habit({
            id: "archived",
            archived: true,
            name: "Archived",
          }),
          habit({
            categoryId: "mind",
            tagIds: ["energy", "unknown"],
            timeOfDay: "08:30",
          }),
        ],
        completions: { "habit-1": ["2026-01-05"] },
        completionNotes: { [noteKey]: "Felt focused" },
        habitOrder: ["habit-1"],
      }),
      { startKey: "2026-01-05", endKey: "2026-01-05" },
      {},
      {
        fizrukPlanDays: { "2026-01-05": { templateId: "tpl-1" } },
        fizrukTemplateNames: new Map([["tpl-1", "Upper body"]]),
      },
    );

    expect(events.map((event) => event.sourceKind)).toEqual([
      "fizruk",
      "habit",
    ]);
    expect(events[0]).toMatchObject({
      id: "fizruk_2026-01-05_tpl-1",
      title: "Upper body",
      tagLabels: [FIZRUK_GROUP_LABEL],
    });
    expect(events[1]).toMatchObject({
      id: "habit_habit-1_2026-01-05",
      completed: true,
      habitId: "habit-1",
      note: "Felt focused",
      tagLabels: ["Energy", "Mind"],
      timeOfDay: "08:30",
    });
    expect(events.some((event) => event.id.includes("archived"))).toBe(false);
  });

  it("uses fallback labels and respects Fizruk/Finyk visibility switches", () => {
    const injectedFinyk = finykEvent("sub-1", "2026-01-05");
    const baseState = state({
      habits: [habit({ tagIds: ["missing"], categoryId: "missing" })],
    });

    const visible = buildHubCalendarEvents(
      baseState,
      { startKey: "2026-01-05", endKey: "2026-01-05" },
      { showFizruk: false },
      {
        fizrukPlanDays: { "2026-01-05": { templateId: "tpl-1" } },
        finykSubscriptionEvents: [injectedFinyk],
      },
    );
    expect(visible.map((event) => event.sourceKind)).toEqual([
      "finyk_sub",
      "habit",
    ]);
    expect(visible[1]?.tagLabels).toHaveLength(1);

    const hidden = buildHubCalendarEvents(
      {
        ...baseState,
        prefs: { ...baseState.prefs, showFinykSubscriptionsInCalendar: false },
      },
      { startKey: "2026-01-05", endKey: "2026-01-05" },
      { showFinykSubs: true },
      { finykSubscriptionEvents: [injectedFinyk] },
    );
    expect(hidden.map((event) => event.sourceKind)).toEqual(["habit"]);
  });

  it("counts events per date", () => {
    const events = [
      finykEvent("a", "2026-01-05"),
      finykEvent("b", "2026-01-05"),
      finykEvent("c", "2026-01-06"),
    ];

    expect([...countEventsByDate(events).entries()]).toEqual([
      ["2026-01-05", 2],
      ["2026-01-06", 1],
    ]);
  });

  it("builds Finyk subscription events and clamps billing days to month end", () => {
    const seen: string[] = [];
    const events = buildFinykSubscriptionEvents(
      { startKey: "2026-02-01", endKey: "2026-03-31" },
      [
        { id: "ok", name: "Music", emoji: "M", billingDay: 31 },
        { id: "bad-low", billingDay: 0 },
        { id: "bad-high", billingDay: 32 },
        { id: "bad-text", billingDay: "nope" },
      ],
      (sub) => {
        seen.push(sub.id);
        return { amount: sub.id === "ok" ? 129.5 : null, currency: "UAH" };
      },
    );

    expect(seen).toEqual(["ok"]);
    expect(events.map((event) => event.date)).toEqual([
      "2026-02-28",
      "2026-03-31",
    ]);
    expect(events[0]).toMatchObject({
      id: "finyk_sub_ok_2026-02-28",
      title: "M Music",
      tagLabels: [FINYK_SUB_GROUP_LABEL],
      finykSub: true,
      sourceKind: "finyk_sub",
    });
    expect(events[0]?.subtitle).toContain("129,5 UAH");
  });
});
