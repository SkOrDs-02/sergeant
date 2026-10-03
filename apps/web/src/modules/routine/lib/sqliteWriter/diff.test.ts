import { describe, expect, it } from "vitest";
import type { RoutinePrefs, RoutineState } from "@sergeant/routine-domain";
import { buildCompletionRowId, diffRoutineDualWriteOps } from "./diff";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeState(partial: Partial<RoutineState> = {}): RoutineState {
  return {
    schemaVersion: 1,
    prefs: {},
    tags: [],
    categories: [],
    habits: [],
    completions: {},
    habitOrder: [],
    completionNotes: {},
    ...partial,
  };
}

// ─── identity short-cut ─────────────────────────────────────────────────────

describe("diffRoutineDualWriteOps – identity short-cut", () => {
  it("returns [] when prev === next", () => {
    const state = makeState();
    expect(diffRoutineDualWriteOps(state, state)).toEqual([]);
  });
});

// ─── buildCompletionRowId ────────────────────────────────────────────────────

describe("buildCompletionRowId", () => {
  it("joins habitId and dateKey with colon", () => {
    expect(buildCompletionRowId("h1", "2026-04-20")).toBe("h1:2026-04-20");
  });
});

// ─── completion-add ──────────────────────────────────────────────────────────

describe("diffRoutineDualWriteOps – completion-add", () => {
  it("emits completion-add when a new dateKey appears for a habit with a name", () => {
    const prev = makeState({
      habits: [{ id: "h1", name: "Run" }],
      completions: {},
    });
    const next = makeState({
      habits: [{ id: "h1", name: "Run" }],
      completions: { h1: ["2026-04-20"] },
    });
    const ops = diffRoutineDualWriteOps(prev, next);
    // Стадія 1 W1-ROUTINE-APPEND: поруч зі старим `completion-add` тепер
    // їде append-only подія журналу. Старий op не змінився.
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({
      kind: "completion-add",
      habitId: "h1",
      habitName: "Run",
      dateKey: "2026-04-20",
    });
    expect(ops[1]).toMatchObject({
      kind: "completion-event-append",
      habitId: "h1",
      dateKey: "2026-04-20",
      state: "done",
    });
  });

  it("skips completion-add when habit has no name in next state", () => {
    const prev = makeState({ completions: {} });
    const next = makeState({
      habits: [],
      completions: { unknown: ["2026-04-20"] },
    });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops.filter((o) => o.kind === "completion-add")).toHaveLength(0);
  });

  it("emits multiple completion-add sorted by habitId then dateKey", () => {
    const prev = makeState({ completions: {} });
    const next = makeState({
      habits: [
        { id: "b", name: "B" },
        { id: "a", name: "A" },
      ],
      completions: { b: ["2026-04-21"], a: ["2026-04-20", "2026-04-19"] },
    });
    const adds = diffRoutineDualWriteOps(prev, next).filter(
      (o) => o.kind === "completion-add",
    );
    expect(
      adds.map(
        (o) => (o as { habitId: string; dateKey: string }).habitId + o.kind,
      ),
    ).toEqual(["acompletion-add", "acompletion-add", "bcompletion-add"]);
    const aDates = adds
      .filter((o) => (o as { habitId: string }).habitId === "a")
      .map((o) => (o as { dateKey: string }).dateKey);
    expect(aDates).toEqual(["2026-04-19", "2026-04-20"]);
  });
});

// ─── completion-remove ───────────────────────────────────────────────────────

describe("diffRoutineDualWriteOps – completion-remove", () => {
  it("emits completion-remove when a dateKey disappears", () => {
    const prev = makeState({
      habits: [{ id: "h1", name: "Run" }],
      completions: { h1: ["2026-04-20"] },
    });
    const next = makeState({
      habits: [{ id: "h1", name: "Run" }],
      completions: {},
    });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({
      kind: "completion-remove",
      habitId: "h1",
      dateKey: "2026-04-20",
    });
    // Зняття відмітки тепер лишає слід у журналі — саме цього старий
    // soft-delete-шлях не вміє (audit E-1).
    expect(ops[1]).toMatchObject({
      kind: "completion-event-append",
      habitId: "h1",
      dateKey: "2026-04-20",
      state: "undone",
    });
  });
});

// ─── completion-event-append (W1-ROUTINE-APPEND стадія 1) ────────────────────

describe("diffRoutineDualWriteOps – completion-event-append", () => {
  it("пише подію навіть коли звички вже немає в next.habits", () => {
    // Старий `completion-add` тут пропускається (нема імені для
    // денормалізації `routine_entries.name`), а журнал факт фіксує.
    const prev = makeState({ completions: {} });
    const next = makeState({
      habits: [],
      completions: { orphan: ["2026-04-20"] },
    });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops.filter((o) => o.kind === "completion-add")).toHaveLength(0);
    expect(ops.filter((o) => o.kind === "completion-event-append")).toEqual([
      {
        kind: "completion-event-append",
        habitId: "orphan",
        dateKey: "2026-04-20",
        state: "done",
      },
    ]);
  });

  it("детермінований порядок: habitId, потім dateKey, потім state", () => {
    const prev = makeState({
      habits: [{ id: "a", name: "A" }],
      completions: { a: ["2026-04-18"] },
    });
    const next = makeState({
      habits: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      completions: { a: ["2026-04-19"], b: ["2026-04-20"] },
    });
    const events = diffRoutineDualWriteOps(prev, next).filter(
      (o) => o.kind === "completion-event-append",
    );
    expect(events).toEqual([
      {
        kind: "completion-event-append",
        habitId: "a",
        dateKey: "2026-04-18",
        state: "undone",
      },
      {
        kind: "completion-event-append",
        habitId: "a",
        dateKey: "2026-04-19",
        state: "done",
      },
      {
        kind: "completion-event-append",
        habitId: "b",
        dateKey: "2026-04-20",
        state: "done",
      },
    ]);
  });

  it("не породжує подій, коли completions не змінились", () => {
    const prev = makeState({
      habits: [{ id: "h1", name: "Run" }],
      completions: { h1: ["2026-04-20"] },
    });
    const next = makeState({
      habits: [{ id: "h1", name: "Run 2.0" }],
      completions: { h1: ["2026-04-20"] },
    });
    expect(
      diffRoutineDualWriteOps(prev, next).filter(
        (o) => o.kind === "completion-event-append",
      ),
    ).toEqual([]);
  });
});

// ─── habit-rename ────────────────────────────────────────────────────────────

describe("diffRoutineDualWriteOps – habit-rename", () => {
  it("emits habit-rename when habit name changes", () => {
    const prev = makeState({ habits: [{ id: "h1", name: "Plank" }] });
    const next = makeState({ habits: [{ id: "h1", name: "Plank 2.0" }] });
    const ops = diffRoutineDualWriteOps(prev, next);
    const renameOps = ops.filter((o) => o.kind === "habit-rename");
    expect(renameOps).toHaveLength(1);
    expect(renameOps[0]).toMatchObject({
      kind: "habit-rename",
      habitId: "h1",
      prevName: "Plank",
      nextName: "Plank 2.0",
    });
  });

  it("does not emit habit-rename for brand-new habit", () => {
    const prev = makeState({ habits: [] });
    const next = makeState({ habits: [{ id: "h1", name: "New" }] });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops.filter((o) => o.kind === "habit-rename")).toHaveLength(0);
  });
});

// ─── habit-upsert / habit-delete ─────────────────────────────────────────────

describe("diffRoutineDualWriteOps – habit entity ops", () => {
  it("emits habit-upsert for a new habit", () => {
    const prev = makeState({ habits: [] });
    const next = makeState({ habits: [{ id: "h1", name: "Yoga" }] });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops.some((o) => o.kind === "habit-upsert")).toBe(true);
  });

  it("emits habit-delete when a habit is removed", () => {
    const prev = makeState({ habits: [{ id: "h1", name: "Old" }] });
    const next = makeState({ habits: [] });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({ kind: "habit-delete", habitId: "h1" });
  });

  it("emits habit-upsert when archived flag changes", () => {
    const habit = { id: "h1", name: "Run" };
    const prev = makeState({ habits: [{ ...habit, archived: false }] });
    const next = makeState({ habits: [{ ...habit, archived: true }] });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops.some((o) => o.kind === "habit-upsert")).toBe(true);
  });

  it("emits no ops when same habit reference is reused", () => {
    const habit = { id: "h1", name: "Run" };
    const prev = makeState({ habits: [habit] });
    const next = makeState({ habits: [habit] });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(
      ops.filter((o) => o.kind === "habit-upsert" || o.kind === "habit-delete"),
    ).toHaveLength(0);
  });
});

// ─── tag-upsert / tag-delete ─────────────────────────────────────────────────

describe("diffRoutineDualWriteOps – tag ops", () => {
  it("emits tag-upsert for a new tag", () => {
    const prev = makeState({ tags: [] });
    const next = makeState({ tags: [{ id: "t1", name: "Work" }] });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({
      kind: "tag-upsert",
      tag: { id: "t1", name: "Work" },
    });
  });

  it("emits tag-delete when a tag is removed", () => {
    const prev = makeState({ tags: [{ id: "t1", name: "Work" }] });
    const next = makeState({ tags: [] });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({ kind: "tag-delete", tagId: "t1" });
  });

  it("emits tag-upsert when tag name changes", () => {
    const prev = makeState({ tags: [{ id: "t1", name: "Work" }] });
    const next = makeState({ tags: [{ id: "t1", name: "Career" }] });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops.some((o) => o.kind === "tag-upsert")).toBe(true);
  });

  it("emits tag-upsert when scope changes", () => {
    const prev = makeState({
      tags: [{ id: "t1", name: "Work", scope: "morning" }],
    });
    const next = makeState({
      tags: [{ id: "t1", name: "Work", scope: "evening" }],
    });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops.some((o) => o.kind === "tag-upsert")).toBe(true);
  });
});

// ─── category-upsert / category-delete ───────────────────────────────────────

describe("diffRoutineDualWriteOps – category ops", () => {
  it("emits category-upsert for a new category", () => {
    const prev = makeState({ categories: [] });
    const next = makeState({ categories: [{ id: "c1", name: "Health" }] });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({
      kind: "category-upsert",
      category: { id: "c1", name: "Health" },
    });
  });

  it("emits category-delete when a category is removed", () => {
    const prev = makeState({ categories: [{ id: "c1", name: "Health" }] });
    const next = makeState({ categories: [] });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({ kind: "category-delete", categoryId: "c1" });
  });

  it("emits category-upsert when emoji changes", () => {
    const prev = makeState({
      categories: [{ id: "c1", name: "Health", emoji: "🏃" }],
    });
    const next = makeState({
      categories: [{ id: "c1", name: "Health", emoji: "💪" }],
    });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops.some((o) => o.kind === "category-upsert")).toBe(true);
  });
});

// ─── prefs-set ───────────────────────────────────────────────────────────────

describe("diffRoutineDualWriteOps – prefs-set", () => {
  it("emits prefs-set when prefs change", () => {
    const newPrefs: RoutinePrefs = { showFizrukInCalendar: true };
    const prev = makeState({ prefs: {} });
    const next = makeState({ prefs: newPrefs });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({ kind: "prefs-set", prefs: newPrefs });
  });

  it("does not emit prefs-set when prefs are identical by value", () => {
    const prev = makeState({ prefs: { showFizrukInCalendar: true } });
    const next = makeState({ prefs: { showFizrukInCalendar: true } });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops.filter((o) => o.kind === "prefs-set")).toHaveLength(0);
  });

  it("does not emit prefs-set when same prefs reference", () => {
    const prefs: RoutinePrefs = {};
    const prev = makeState({ prefs });
    const next = makeState({ prefs });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops.filter((o) => o.kind === "prefs-set")).toHaveLength(0);
  });
});

// ─── habit-order-set ─────────────────────────────────────────────────────────

describe("diffRoutineDualWriteOps – habit-order-set", () => {
  it("emits habit-order-set when order changes", () => {
    const prev = makeState({ habitOrder: ["h1", "h2"] });
    const next = makeState({ habitOrder: ["h2", "h1"] });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({
      kind: "habit-order-set",
      orderedIds: ["h2", "h1"],
    });
  });

  it("does not emit when order is identical by value", () => {
    const prev = makeState({ habitOrder: ["h1", "h2"] });
    const next = makeState({ habitOrder: ["h1", "h2"] });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops.filter((o) => o.kind === "habit-order-set")).toHaveLength(0);
  });

  it("does not emit when same reference", () => {
    const habitOrder = ["h1", "h2"];
    const prev = makeState({ habitOrder });
    const next = makeState({ habitOrder });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops.filter((o) => o.kind === "habit-order-set")).toHaveLength(0);
  });
});

// ─── completion-note-upsert / completion-note-delete ─────────────────────────

describe("diffRoutineDualWriteOps – completion-note ops", () => {
  it("emits completion-note-upsert for a new note", () => {
    const prev = makeState({ completionNotes: {} });
    const next = makeState({
      completionNotes: { "h1:2026-04-20": "Great day!" },
    });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({
      kind: "completion-note-upsert",
      noteKey: "h1:2026-04-20",
      note: "Great day!",
    });
  });

  it("emits completion-note-delete when note becomes blank", () => {
    const prev = makeState({
      completionNotes: { "h1:2026-04-20": "Was here" },
    });
    const next = makeState({ completionNotes: { "h1:2026-04-20": "   " } });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops).toContainEqual({
      kind: "completion-note-delete",
      noteKey: "h1:2026-04-20",
    });
  });

  it("emits completion-note-delete when note is removed", () => {
    const prev = makeState({
      completionNotes: { "h1:2026-04-20": "Was here" },
    });
    const next = makeState({ completionNotes: {} });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(ops.some((o) => o.kind === "completion-note-delete")).toBe(true);
  });

  it("does not emit when same reference", () => {
    const completionNotes = { "h1:2026-04-20": "Note" };
    const prev = makeState({ completionNotes });
    const next = makeState({ completionNotes });
    const ops = diffRoutineDualWriteOps(prev, next);
    expect(
      ops.filter(
        (o) =>
          o.kind === "completion-note-upsert" ||
          o.kind === "completion-note-delete",
      ),
    ).toHaveLength(0);
  });

  it("sorts upserts by noteKey ascending", () => {
    const prev = makeState({ completionNotes: {} });
    const next = makeState({
      completionNotes: { "h2:2026-04-20": "B", "h1:2026-04-20": "A" },
    });
    const ops = diffRoutineDualWriteOps(prev, next).filter(
      (o) => o.kind === "completion-note-upsert",
    );
    const keys = ops.map((o) => (o as { noteKey: string }).noteKey);
    expect(keys).toEqual(["h1:2026-04-20", "h2:2026-04-20"]);
  });
});

// ─── stable op ordering ──────────────────────────────────────────────────────

describe("diffRoutineDualWriteOps – stable op ordering", () => {
  it("puts completion-add before completion-remove before habit-rename", () => {
    const prev = makeState({
      habits: [{ id: "h1", name: "Old" }],
      completions: { h1: ["2026-04-19"] },
    });
    const next = makeState({
      habits: [{ id: "h1", name: "New" }],
      completions: { h1: ["2026-04-20"] },
    });
    const ops = diffRoutineDualWriteOps(prev, next);
    const kinds = ops.map((o) => o.kind);
    const addIdx = kinds.indexOf("completion-add");
    const removeIdx = kinds.indexOf("completion-remove");
    const renameIdx = kinds.indexOf("habit-rename");
    expect(addIdx).toBeLessThan(removeIdx);
    expect(removeIdx).toBeLessThan(renameIdx);
  });
});
