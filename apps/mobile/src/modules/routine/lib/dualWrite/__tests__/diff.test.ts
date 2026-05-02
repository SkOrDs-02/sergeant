/**
 * Mobile mirror of `apps/web/src/modules/routine/lib/dualWrite/__tests__/diff.test.ts`.
 *
 * Pure-function diff has no platform-specific behaviour, so the
 * cases mirror the web spec exactly (jest assertion API).
 */
import type { RoutineState } from "@sergeant/routine-domain";

import { buildCompletionRowId, diffRoutineDualWriteOps } from "../diff";

function makeState(overrides: Partial<RoutineState> = {}): RoutineState {
  return {
    schemaVersion: 1,
    prefs: {},
    tags: [],
    categories: [],
    habits: [],
    completions: {},
    pushupsByDate: {},
    habitOrder: [],
    completionNotes: {},
    ...overrides,
  };
}

describe("diffRoutineDualWriteOps", () => {
  it("returns no ops when prev === next", () => {
    const state = makeState({
      habits: [{ id: "h1", name: "Drink water" }],
      completions: { h1: ["2026-05-01"] },
    });
    expect(diffRoutineDualWriteOps(state, state)).toEqual([]);
  });

  it("emits completion-add for newly-completed (habit, date)", () => {
    const prev = makeState({
      habits: [{ id: "h1", name: "Drink water" }],
      completions: {},
    });
    const next = makeState({
      habits: [{ id: "h1", name: "Drink water" }],
      completions: { h1: ["2026-05-01"] },
    });
    expect(diffRoutineDualWriteOps(prev, next)).toEqual([
      {
        kind: "completion-add",
        habitId: "h1",
        habitName: "Drink water",
        dateKey: "2026-05-01",
      },
    ]);
  });

  it("emits completion-remove when a (habit, date) drops out", () => {
    const prev = makeState({
      habits: [{ id: "h1", name: "Drink water" }],
      completions: { h1: ["2026-05-01", "2026-05-02"] },
    });
    const next = makeState({
      habits: [{ id: "h1", name: "Drink water" }],
      completions: { h1: ["2026-05-02"] },
    });
    expect(diffRoutineDualWriteOps(prev, next)).toEqual([
      { kind: "completion-remove", habitId: "h1", dateKey: "2026-05-01" },
    ]);
  });

  it("captures hard-delete as completion-removes for every dateKey", () => {
    const prev = makeState({
      habits: [
        { id: "h1", name: "Drink water" },
        { id: "h2", name: "Stretch" },
      ],
      completions: { h1: ["2026-05-01", "2026-05-02"], h2: ["2026-05-01"] },
    });
    const next = makeState({
      habits: [{ id: "h2", name: "Stretch" }],
      completions: { h2: ["2026-05-01"] },
    });
    expect(diffRoutineDualWriteOps(prev, next)).toEqual([
      { kind: "completion-remove", habitId: "h1", dateKey: "2026-05-01" },
      { kind: "completion-remove", habitId: "h1", dateKey: "2026-05-02" },
    ]);
  });

  it("emits habit-rename when same id has a different name", () => {
    const prev = makeState({
      habits: [{ id: "h1", name: "Drink water" }],
      completions: { h1: ["2026-05-01"] },
    });
    const next = makeState({
      habits: [{ id: "h1", name: "Drink 2L of water" }],
      completions: { h1: ["2026-05-01"] },
    });
    expect(diffRoutineDualWriteOps(prev, next)).toEqual([
      {
        kind: "habit-rename",
        habitId: "h1",
        prevName: "Drink water",
        nextName: "Drink 2L of water",
      },
    ]);
  });

  it("orders ops deterministically: adds, removes, renames", () => {
    const prev = makeState({
      habits: [
        { id: "h2", name: "Stretch" },
        { id: "h1", name: "Drink water" },
      ],
      completions: { h2: ["2026-05-02"], h1: ["2026-05-01"] },
    });
    const next = makeState({
      habits: [
        { id: "h2", name: "Stretch slowly" },
        { id: "h1", name: "Drink water" },
      ],
      completions: {
        h2: ["2026-05-02", "2026-05-03"],
        h1: ["2026-05-04"],
      },
    });
    expect(diffRoutineDualWriteOps(prev, next)).toEqual([
      {
        kind: "completion-add",
        habitId: "h1",
        habitName: "Drink water",
        dateKey: "2026-05-04",
      },
      {
        kind: "completion-add",
        habitId: "h2",
        habitName: "Stretch slowly",
        dateKey: "2026-05-03",
      },
      { kind: "completion-remove", habitId: "h1", dateKey: "2026-05-01" },
      {
        kind: "habit-rename",
        habitId: "h2",
        prevName: "Stretch",
        nextName: "Stretch slowly",
      },
    ]);
  });

  it("ignores malformed completion entries", () => {
    const prev = makeState({
      habits: [{ id: "h1", name: "Drink water" }],
      completions: {},
    });
    const next = makeState({
      habits: [{ id: "h1", name: "Drink water" }],
      completions: {
        h1: [
          "2026-05-01",
          "",
          null as unknown as string,
          42 as unknown as string,
        ],
      },
    });
    expect(diffRoutineDualWriteOps(prev, next)).toEqual([
      {
        kind: "completion-add",
        habitId: "h1",
        habitName: "Drink water",
        dateKey: "2026-05-01",
      },
    ]);
  });
});

describe("buildCompletionRowId", () => {
  it("joins habitId and dateKey with a colon", () => {
    expect(buildCompletionRowId("h1", "2026-05-01")).toBe("h1:2026-05-01");
  });
});
