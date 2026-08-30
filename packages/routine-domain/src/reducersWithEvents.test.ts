import { describe, expect, it } from "vitest";

import {
  applyMarkAllScheduledHabitsComplete,
  applyToggleHabitCompletion,
} from "./reducers.js";
import {
  applyMarkAllScheduledHabitsCompleteWithEvents,
  applyToggleHabitCompletionWithEvents,
} from "./reducersWithEvents.js";
import { foldCompletionEvents } from "./foldCompletionEvents.js";
import type { CompletionEventContext } from "./completionEvents.js";
import type { RoutineState } from "./types.js";

/**
 * W1-ROUTINE-APPEND стадія 1 — журнал пишеться ПАРАЛЕЛЬНО зі старим станом.
 *
 * Головний інваріант, який тут фіксується: `*WithEvents` віддає БАЙТ-У-БАЙТ
 * той самий `RoutineState`, що й старий редюсер. Якщо це зламається —
 * зламається продукт, а не журнал.
 */

const CTX: CompletionEventContext = {
  occurredAt: "2026-07-20T09:00:00.000+03:00",
  tzOffsetMin: 180,
  dayAnchor: "device-local",
  source: "ui",
  deviceId: "dev-a",
};

function baseState(): RoutineState {
  return {
    schemaVersion: 1,
    prefs: {},
    tags: [],
    categories: [],
    habits: [
      { id: "hab_1", name: "Читати", recurrence: "daily" },
      { id: "hab_2", name: "Вода", recurrence: "daily" },
    ],
    completions: {},
    habitOrder: ["hab_1", "hab_2"],
    completionNotes: {},
  };
}

describe("applyToggleHabitCompletionWithEvents", () => {
  it("віддає той самий стан, що й старий редюсер (additive-контракт)", () => {
    const s = baseState();
    const legacy = applyToggleHabitCompletion(s, "hab_1", "2026-07-20");
    const next = applyToggleHabitCompletionWithEvents(
      s,
      "hab_1",
      "2026-07-20",
      CTX,
    );
    expect(next.state.completions).toEqual(legacy.completions);
  });

  it("додавання відмітки породжує подію `done`", () => {
    const next = applyToggleHabitCompletionWithEvents(
      baseState(),
      "hab_1",
      "2026-07-20",
      CTX,
    );
    expect(next.events).toHaveLength(1);
    expect(next.events[0]).toMatchObject({
      habitId: "hab_1",
      dateKey: "2026-07-20",
      state: "done",
      occurredAt: CTX.occurredAt,
      tzOffsetMin: 180,
      dayAnchor: "device-local",
      source: "ui",
      deviceId: "dev-a",
    });
  });

  it("зняття відмітки породжує подію `undone` — факт більше не зникає безслідно", () => {
    const s = applyToggleHabitCompletion(baseState(), "hab_1", "2026-07-20");
    const next = applyToggleHabitCompletionWithEvents(
      s,
      "hab_1",
      "2026-07-20",
      { ...CTX, occurredAt: "2026-07-20T09:05:00.000+03:00" },
    );
    expect(next.state.completions["hab_1"]).toEqual([]);
    expect(next.events).toHaveLength(1);
    expect(next.events[0]!.state).toBe("undone");
  });

  it("no-op старого редюсера не породжує подій (невідома звичка)", () => {
    const s = baseState();
    const next = applyToggleHabitCompletionWithEvents(
      s,
      "missing",
      "2026-07-20",
      CTX,
    );
    expect(next.state).toBe(s);
    expect(next.events).toEqual([]);
  });

  it("no-op старого редюсера не породжує подій (день не запланований)", () => {
    const s = baseState();
    s.habits = [
      {
        id: "hab_1",
        name: "Тільки понеділок",
        recurrence: "weekly",
        weekdays: [1],
      },
    ];
    // 2026-07-19 — неділя.
    const next = applyToggleHabitCompletionWithEvents(
      s,
      "hab_1",
      "2026-07-19",
      CTX,
    );
    expect(next.state).toBe(s);
    expect(next.events).toEqual([]);
  });

  it("журнал циклу toggle→untoggle→toggle згортається у поточний стан", () => {
    let state = baseState();
    const events = [];
    for (const [i, at] of [
      "2026-07-20T09:00:00.000+03:00",
      "2026-07-20T09:05:00.000+03:00",
      "2026-07-20T09:10:00.000+03:00",
    ].entries()) {
      const step = applyToggleHabitCompletionWithEvents(
        state,
        "hab_1",
        "2026-07-20",
        { ...CTX, occurredAt: at },
      );
      state = step.state;
      events.push(...step.events);
      expect(step.events).toHaveLength(1);
      expect(step.events[0]!.state).toBe(i % 2 === 0 ? "done" : "undone");
    }
    expect(events).toHaveLength(3);
    expect(foldCompletionEvents(events)).toEqual({
      hab_1: ["2026-07-20"],
    });
    expect(state.completions["hab_1"]).toEqual(["2026-07-20"]);
  });
});

describe("applyMarkAllScheduledHabitsCompleteWithEvents", () => {
  it("віддає той самий стан, що й старий редюсер", () => {
    const s = baseState();
    const legacy = applyMarkAllScheduledHabitsComplete(s, "2026-07-20");
    const next = applyMarkAllScheduledHabitsCompleteWithEvents(
      s,
      "2026-07-20",
      CTX,
    );
    expect(next.state.completions).toEqual(legacy.completions);
  });

  it("по одній події `done` на кожну щойно відмічену звичку, у порядку habitId", () => {
    const next = applyMarkAllScheduledHabitsCompleteWithEvents(
      baseState(),
      "2026-07-20",
      CTX,
    );
    expect(next.events.map((e) => e.habitId)).toEqual(["hab_1", "hab_2"]);
    expect(next.events.every((e) => e.state === "done")).toBe(true);
  });

  it("вже відмічені звички подій не породжують", () => {
    const s = applyToggleHabitCompletion(baseState(), "hab_1", "2026-07-20");
    const next = applyMarkAllScheduledHabitsCompleteWithEvents(
      s,
      "2026-07-20",
      CTX,
    );
    expect(next.events.map((e) => e.habitId)).toEqual(["hab_2"]);
  });

  it("no-op (усе вже відмічено) не породжує подій", () => {
    const s = applyMarkAllScheduledHabitsComplete(baseState(), "2026-07-20");
    const next = applyMarkAllScheduledHabitsCompleteWithEvents(
      s,
      "2026-07-20",
      CTX,
    );
    expect(next.state).toBe(s);
    expect(next.events).toEqual([]);
  });
});
