import { afterEach, describe, expect, it } from "vitest";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "@fizruk/lib/sqliteReader";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "@finyk/lib/sqliteReader";
import { buildHubCalendarEvents } from "./hubCalendarAggregate";
import { defaultRoutineState } from "@sergeant/routine-domain";
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

// logic-09: писачі Фізрука й підписок Фініка пишуть лише в SQLite, LS-ключі
// порожні. Календар має читати SQLite-кеш, а не localStorage.
describe("buildHubCalendarEvents — крос-модульні читачі (logic-09)", () => {
  const OCT = { startKey: "2026-10-01", endKey: "2026-10-31" };

  afterEach(() => {
    clearFizrukSqliteCache();
    clearFinykSqliteCache();
    localStorage.clear();
  });

  it("показує заплановане тренування Фізрука з SQLite-кешу при порожньому localStorage", () => {
    localStorage.clear();
    __setFizrukSqliteCacheForTests({
      monthlyPlan: {
        reminderEnabled: false,
        reminderHour: 8,
        reminderMinute: 0,
        days: { "2026-10-05": { templateId: "t1" } },
      },
      workoutTemplates: [
        {
          id: "t1",
          name: "Ноги",
          exerciseIds: [],
          groups: [],
          updatedAt: "2026-10-01T00:00:00.000Z",
        },
      ],
    });
    const events = buildHubCalendarEvents(defaultRoutineState(), OCT, {
      showFizruk: true,
      showFinykSubs: false,
    }).filter((e) => e.fizruk);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ date: "2026-10-05", title: "Ноги" });

    // Призначення зняли в SQLite → подія зникає.
    __setFizrukSqliteCacheForTests({ monthlyPlan: null });
    expect(
      buildHubCalendarEvents(defaultRoutineState(), OCT, {
        showFizruk: true,
        showFinykSubs: false,
      }).filter((e) => e.fizruk),
    ).toHaveLength(0);
  });

  it("показує підписку Фініка з SQLite-кешу і прибирає її після видалення", () => {
    localStorage.clear();
    __setFinykSqliteStateCacheForTests({
      subscriptions: [
        { id: "s1", name: "Netflix", billingDay: 5, emoji: "🎬" },
      ] as never[],
    });
    const build = () =>
      buildHubCalendarEvents(defaultRoutineState(), OCT, {
        showFizruk: false,
        showFinykSubs: true,
      }).filter((e) => e.finykSub);

    const events = build();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ date: "2026-10-05", title: "Netflix" });

    __setFinykSqliteStateCacheForTests({ subscriptions: [] });
    expect(build()).toHaveLength(0);
  });
});
