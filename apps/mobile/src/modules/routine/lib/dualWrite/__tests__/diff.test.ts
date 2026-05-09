/**
 * Mobile mirror of `apps/web/src/modules/routine/lib/dualWrite/__tests__/diff.test.ts`.
 *
 * Pure-function diff has no platform-specific behaviour, so the
 * cases mirror the web spec exactly (jest assertion API).
 *
 * **Stage 10 mobile mirror** extends the diff coverage from the
 * completion-only baseline to the full 7-table entity ops set.
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

  it("captures hard-delete as completion-removes for every dateKey + habit-delete", () => {
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
      // Stage 10: habit removed from the array → habit-delete
      { kind: "habit-delete", habitId: "h1" },
    ]);
  });

  it("emits habit-rename + habit-upsert when same id has a different name", () => {
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

  it("emits habit-upsert (and no habit-rename) when the habit is brand new", () => {
    const prev = makeState({ habits: [], completions: {} });
    const next = makeState({
      habits: [{ id: "h1", name: "Drink water" }],
      completions: {},
    });
    expect(diffRoutineDualWriteOps(prev, next)).toEqual([
      { kind: "habit-upsert", habit: { id: "h1", name: "Drink water" } },
    ]);
  });

  it("orders ops deterministically: adds, removes, renames, then entity ops", () => {
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
      // Stage 10: name change also emits habit-upsert
      {
        kind: "habit-upsert",
        habit: { id: "h2", name: "Stretch slowly" },
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
    const next = makeState({ tags: [{ id: "t1", name: "morning" }] });
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
    const next = makeState({ prefs: { showFizrukInCalendar: true } });
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
