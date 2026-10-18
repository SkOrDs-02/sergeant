/** @vitest-environment jsdom */
import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultRoutineState } from "@sergeant/routine-domain";
import { CategoriesSection } from "./CategoriesSection";
import { TagsSection } from "./TagsSection";
import { useRoutineState } from "../../hooks/useRoutineState";
import { loadRoutineState, saveRoutineState } from "../../lib/routineStorage";
import {
  clearSqliteCompletionsCache,
  clearSqliteRoutineStateCache,
} from "../../lib/sqliteReader";
import type { CategoryDraft, RoutineState } from "../../lib/types";

const { undoToast, triggerWrite } = vi.hoisted(() => ({
  undoToast: vi.fn(),
  triggerWrite: vi.fn(),
}));
vi.mock("@shared/lib/ui/undoToast", () => ({ showUndoToast: undoToast }));
vi.mock("@shared/hooks/useToast", () => ({ useToast: () => ({}) }));
// Keep the real write-through cache and storage facade; only SQLite I/O is
// replaced so an undo must still reach the persistence boundary.
vi.mock("../../lib/sqliteWriter/index.js", () => ({
  triggerRoutineDualWrite: triggerWrite,
  dualWriteRoutineState: vi.fn(),
}));

function Harness({ kind }: { kind: "category" | "tag" }) {
  const { routine, setRoutine } = useRoutineState();
  const [catDraft, setCatDraft] = useState<CategoryDraft>({
    name: "",
    emoji: "",
  });
  const [tagDraft, setTagDraft] = useState("");
  return (
    <>
      {kind === "category" ? (
        <CategoriesSection
          routine={routine}
          setRoutine={setRoutine}
          catDraft={catDraft}
          setCatDraft={setCatDraft}
        />
      ) : (
        <TagsSection
          routine={routine}
          setRoutine={setRoutine}
          tagDraft={tagDraft}
          setTagDraft={setTagDraft}
        />
      )}
      <output data-testid="routine-state">{JSON.stringify(routine)}</output>
    </>
  );
}

const initialState = (): RoutineState => ({
  ...defaultRoutineState(),
  categories: [{ id: "category-1", name: "Здоровʼя", emoji: "" }],
  tags: [{ id: "tag-1", name: "Ранок" }],
  habits: [
    {
      id: "h1",
      name: "Вода",
      recurrence: "daily",
      categoryId: "category-1",
      tagIds: ["tag-1"],
    },
  ],
  habitOrder: ["h1"],
  completions: { h1: ["2026-10-15"] },
});

function undo() {
  const options = undoToast.mock.calls.at(-1)?.[1] as { onUndo: () => void };
  expect(options).toBeDefined();
  act(() => options.onUndo());
}

beforeEach(() => {
  clearSqliteRoutineStateCache();
  clearSqliteCompletionsCache();
  vi.clearAllMocks();
  saveRoutineState(initialState());
});
afterEach(cleanup);

describe.each([
  {
    kind: "category" as const,
    manager: "Категорії",
    name: "Здоровʼя",
    slice: "categories" as const,
  },
  {
    kind: "tag" as const,
    manager: "Теги",
    name: "Ранок",
    slice: "tags" as const,
  },
])("Routine $kind undo", ({ kind, manager, name, slice }) => {
  it("restores the deleted entity and its habit memberships across remount", () => {
    const first = render(<Harness kind={kind} />);
    fireEvent.click(
      screen.getByRole("button", { name: `Керувати: ${manager}` }),
    );
    fireEvent.click(screen.getByRole("button", { name: `Видалити ${name}` }));
    expect(loadRoutineState()[slice]).toEqual([]);
    triggerWrite.mockClear();

    undo();

    const restored = loadRoutineState();
    expect(restored[slice]).toEqual(initialState()[slice]);
    expect(restored.habits[0]).toMatchObject({
      categoryId: "category-1",
      tagIds: ["tag-1"],
    });
    expect(triggerWrite).toHaveBeenCalled();
    first.unmount();
    render(<Harness kind={kind} />);
    expect(
      JSON.parse(screen.getByTestId("routine-state").textContent || "{}")[
        slice
      ],
    ).toEqual(initialState()[slice]);
  });

  it("does not resurrect a later-deleted habit or attach a new habit, and repeated undo is idempotent", () => {
    render(<Harness kind={kind} />);
    fireEvent.click(
      screen.getByRole("button", { name: `Керувати: ${manager}` }),
    );
    fireEvent.click(screen.getByRole("button", { name: `Видалити ${name}` }));
    act(() => {
      const current = loadRoutineState();
      saveRoutineState({
        ...current,
        habits: [
          {
            id: "h-new",
            name: "Нова звичка",
            recurrence: "daily",
            categoryId: null,
            tagIds: [],
          },
        ],
        habitOrder: ["h-new"],
        completions: {},
      });
    });

    undo();

    const restored = loadRoutineState();
    expect(restored.habits).toEqual([
      {
        id: "h-new",
        name: "Нова звичка",
        recurrence: "daily",
        categoryId: null,
        tagIds: [],
      },
    ]);
    expect(restored[slice]).toEqual(initialState()[slice]);
    triggerWrite.mockClear();
    undo();
    expect(loadRoutineState()).toEqual(restored);
    expect(triggerWrite).not.toHaveBeenCalled();
  });

  it("preserves later updates and current memberships while undoing only this deletion", () => {
    render(<Harness kind={kind} />);
    fireEvent.click(
      screen.getByRole("button", { name: `Керувати: ${manager}` }),
    );
    fireEvent.click(screen.getByRole("button", { name: `Видалити ${name}` }));
    act(() => {
      const current = loadRoutineState();
      saveRoutineState({
        ...current,
        categories: [
          ...current.categories,
          { id: "category-new", name: "Спорт", emoji: "" },
        ],
        tags: [...current.tags, { id: "tag-new", name: "Новий" }],
        habits: current.habits.map((habit) => ({
          ...habit,
          name: "Оновлена вода",
          categoryId: "category-new",
          tagIds: [...(habit.tagIds || []), "tag-new"],
        })),
        completions: { h1: ["2026-10-15", "2026-10-16"] },
      });
    });

    undo();

    const displayed: RoutineState = JSON.parse(
      screen.getByTestId("routine-state").textContent || "{}",
    );
    expect(displayed.habits[0]).toMatchObject({
      name: "Оновлена вода",
      categoryId: "category-new",
    });
    expect(displayed.tags).toContainEqual({ id: "tag-new", name: "Новий" });
    expect(displayed.completions["h1"]).toContain("2026-10-16");
    expect(displayed[slice]).toContainEqual(initialState()[slice][0]);
    expect(displayed.habits[0]?.tagIds).toEqual(
      kind === "tag" ? ["tag-new", "tag-1"] : ["tag-1", "tag-new"],
    );
    expect(loadRoutineState()).toEqual(displayed);
  });
});
