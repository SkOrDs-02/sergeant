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
      // Stage 10: habit removed from the array → habit-delete
      { kind: "habit-delete", habitId: "h1" },
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
      // Stage 10: name change also emits habit-upsert
      {
        kind: "habit-upsert",
        habit: { id: "h1", name: "Drink 2L of water" },
      },
    ]);
  });

  it("does NOT emit habit-rename when the habit's id is brand new", () => {
    const prev = makeState({ habits: [], completions: {} });
    const next = makeState({
      habits: [{ id: "h1", name: "Drink water" }],
      completions: {},
    });
    // Stage 10: brand-new habit emits habit-upsert (but no habit-rename)
    expect(diffRoutineDualWriteOps(prev, next)).toEqual([
      { kind: "habit-upsert", habit: { id: "h1", name: "Drink water" } },
    ]);
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
      // Stage 10: name change also emits habit-upsert
      {
        kind: "habit-upsert",
        habit: { id: "h2", name: "Stretch slowly" },
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

  // -----------------------------------------------------------------------
  // Stage 10: habit-upsert / habit-delete
  // -----------------------------------------------------------------------

  it("emits habit-upsert when a new habit appears", () => {
    const prev = makeState({ habits: [] });
    const next = makeState({
      habits: [{ id: "h1", name: "Drink water", emoji: "💧" }],
    });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({
      kind: "habit-upsert",
      habit: { id: "h1", name: "Drink water", emoji: "💧" },
    });
  });

  it("emits habit-delete when a habit is removed", () => {
    const prev = makeState({
      habits: [{ id: "h1", name: "Drink water" }],
    });
    const next = makeState({ habits: [] });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({ kind: "habit-delete", habitId: "h1" });
  });

  it("emits habit-upsert when archived flag changes", () => {
    const prev = makeState({
      habits: [{ id: "h1", name: "Drink water", archived: false }],
    });
    const next = makeState({
      habits: [{ id: "h1", name: "Drink water", archived: true }],
    });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({
      kind: "habit-upsert",
      habit: { id: "h1", name: "Drink water", archived: true },
    });
  });

  // -----------------------------------------------------------------------
  // Stage 10: tag-upsert / tag-delete
  // -----------------------------------------------------------------------

  it("emits tag-upsert when a new tag appears", () => {
    const prev = makeState({ tags: [] });
    const next = makeState({
      tags: [{ id: "t1", name: "morning" }],
    });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({
      kind: "tag-upsert",
      tag: { id: "t1", name: "morning" },
    });
  });

  it("emits tag-delete when a tag is removed", () => {
    const prev = makeState({ tags: [{ id: "t1", name: "morning" }] });
    const next = makeState({ tags: [] });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({ kind: "tag-delete", tagId: "t1" });
  });

  // -----------------------------------------------------------------------
  // Stage 10: category-upsert / category-delete
  // -----------------------------------------------------------------------

  it("emits category-upsert when a new category appears", () => {
    const prev = makeState({ categories: [] });
    const next = makeState({
      categories: [{ id: "c1", name: "Health", emoji: "🏥" }],
    });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({
      kind: "category-upsert",
      category: { id: "c1", name: "Health", emoji: "🏥" },
    });
  });

  it("emits category-delete when a category is removed", () => {
    const prev = makeState({
      categories: [{ id: "c1", name: "Health" }],
    });
    const next = makeState({ categories: [] });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({ kind: "category-delete", categoryId: "c1" });
  });

  // -----------------------------------------------------------------------
  // Stage 10: prefs-set
  // -----------------------------------------------------------------------

  it("emits prefs-set when prefs object changes", () => {
    const prev = makeState({ prefs: {} });
    const next = makeState({
      prefs: { showFizrukInCalendar: true },
    });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({
      kind: "prefs-set",
      prefs: { showFizrukInCalendar: true },
    });
  });

  it("does NOT emit prefs-set when JSON is structurally equal", () => {
    const prefs = { showFizrukInCalendar: true };
    const prev = makeState({ prefs: { ...prefs } });
    const next = makeState({ prefs: { ...prefs } });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops.filter((o) => o.kind === "prefs-set")).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Stage 10: pushup-upsert
  // -----------------------------------------------------------------------

  it("emits pushup-upsert when a pushup entry changes", () => {
    const prev = makeState({ pushupsByDate: {} });
    const next = makeState({ pushupsByDate: { "2026-05-01": 30 } });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({
      kind: "pushup-upsert",
      dateKey: "2026-05-01",
      reps: 30,
    });
  });

  // -----------------------------------------------------------------------
  // Stage 10: habit-order-set
  // -----------------------------------------------------------------------

  it("emits habit-order-set when habitOrder changes", () => {
    const prev = makeState({ habitOrder: ["h1", "h2"] });
    const next = makeState({ habitOrder: ["h2", "h1"] });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({
      kind: "habit-order-set",
      orderedIds: ["h2", "h1"],
    });
  });

  it("does NOT emit habit-order-set when order is structurally equal", () => {
    const prev = makeState({ habitOrder: ["h1", "h2"] });
    const next = makeState({ habitOrder: ["h1", "h2"] });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops.filter((o) => o.kind === "habit-order-set")).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Stage 10: completion-note-upsert / completion-note-delete
  // -----------------------------------------------------------------------

  it("emits completion-note-upsert when a note is added", () => {
    const prev = makeState({ completionNotes: {} });
    const next = makeState({
      completionNotes: { "h1__2026-05-01": "did well" },
    });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({
      kind: "completion-note-upsert",
      noteKey: "h1__2026-05-01",
      note: "did well",
    });
  });

  it("emits completion-note-delete when a note is cleared", () => {
    const prev = makeState({
      completionNotes: { "h1__2026-05-01": "did well" },
    });
    const next = makeState({
      completionNotes: { "h1__2026-05-01": "" },
    });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({
      kind: "completion-note-delete",
      noteKey: "h1__2026-05-01",
    });
  });
});

describe("buildCompletionRowId", () => {
  it("joins habitId and dateKey with a colon", () => {
    expect(buildCompletionRowId("h1", "2026-05-01")).toBe("h1:2026-05-01");
  });
});
