import { describe, expect, it } from "vitest";
import type { RoutineState } from "@sergeant/routine-domain";

import { buildCompletionRowId, diffRoutineDualWriteOps } from "../diff.js";

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
  it("returns no ops when prev === next (reference equality)", () => {
    const state = makeState({
      habits: [{ id: "h1", name: "Drink water" }],
      completions: { h1: ["2026-05-01"] },
    });
    expect(diffRoutineDualWriteOps(state, state)).toEqual([]);
  });

  it("returns no ops when two structurally-equal states are passed", () => {
    const prev = makeState({
      habits: [{ id: "h1", name: "Drink water" }],
      completions: { h1: ["2026-05-01"] },
    });
    const next = makeState({
      habits: [{ id: "h1", name: "Drink water" }],
      completions: { h1: ["2026-05-01"] },
    });
    expect(diffRoutineDualWriteOps(prev, next)).toEqual([]);
  });

  it("emits completion-add when a (habitId, dateKey) tuple is newly present", () => {
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

  it("emits completion-remove when a tuple disappears from completions", () => {
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
      completions: {
        h1: ["2026-05-01", "2026-05-02"],
        h2: ["2026-05-01"],
      },
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

  it("emits habit-rename when a habit's name changes (same id present in both)", () => {
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

  it("does NOT emit habit-rename when the habit's id is brand new", () => {
    const prev = makeState({ habits: [], completions: {} });
    const next = makeState({
      habits: [{ id: "h1", name: "Drink water" }],
      completions: {},
    });
    expect(diffRoutineDualWriteOps(prev, next)).toEqual([]);
  });

  it("orders ops deterministically: adds, removes, renames", () => {
    const prev = makeState({
      habits: [
        { id: "h2", name: "Stretch" },
        { id: "h1", name: "Drink water" },
      ],
      completions: {
        h2: ["2026-05-02"],
        h1: ["2026-05-01"],
      },
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
      // adds (sorted by habitId, then dateKey)
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
      // removes
      { kind: "completion-remove", habitId: "h1", dateKey: "2026-05-01" },
      // renames
      {
        kind: "habit-rename",
        habitId: "h2",
        prevName: "Stretch",
        nextName: "Stretch slowly",
      },
    ]);
  });

  it("handles the bulk-mark-day case (multiple adds in one transition)", () => {
    const prev = makeState({
      habits: [
        { id: "h1", name: "Drink water" },
        { id: "h2", name: "Stretch" },
      ],
      completions: {},
    });
    const next = makeState({
      habits: [
        { id: "h1", name: "Drink water" },
        { id: "h2", name: "Stretch" },
      ],
      completions: {
        h1: ["2026-05-01"],
        h2: ["2026-05-01"],
      },
    });
    expect(diffRoutineDualWriteOps(prev, next)).toEqual([
      {
        kind: "completion-add",
        habitId: "h1",
        habitName: "Drink water",
        dateKey: "2026-05-01",
      },
      {
        kind: "completion-add",
        habitId: "h2",
        habitName: "Stretch",
        dateKey: "2026-05-01",
      },
    ]);
  });

  it("ignores malformed completion entries (non-array, non-string values)", () => {
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
          123 as unknown as string,
        ],
        h2: "not-an-array" as unknown as string[],
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

  it("does NOT emit add when the habitId has no matching habit in next.habits", () => {
    // Defensive: a corrupted state may have a completion for a habit id
    // that isn't in `habits`. Without a name we cannot create a row.
    const prev = makeState({ habits: [], completions: {} });
    const next = makeState({
      habits: [],
      completions: { h1: ["2026-05-01"] },
    });
    expect(diffRoutineDualWriteOps(prev, next)).toEqual([]);
  });
});

describe("buildCompletionRowId", () => {
  it("joins habitId and dateKey with a colon", () => {
    expect(buildCompletionRowId("h1", "2026-05-01")).toBe("h1:2026-05-01");
  });
});
