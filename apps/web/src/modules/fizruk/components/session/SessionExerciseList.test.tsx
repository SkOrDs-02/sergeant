// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { WorkoutGroup, WorkoutItem } from "@sergeant/fizruk-domain";
import { SessionExerciseList } from "./SessionExerciseList";

function item(
  id: string,
  name: string,
  sets: Array<[number, number]>,
): WorkoutItem {
  return {
    id,
    exerciseId: id,
    nameUk: name,
    type: "strength",
    primaryGroup: "chest",
    musclesPrimary: ["pec"],
    musclesSecondary: [],
    sets: sets.map(([weightKg, reps]) => ({ weightKg, reps })),
  } as WorkoutItem;
}

const onOpenItem = vi.fn();
const onAddExercise = vi.fn();
const onToggleSelect = vi.fn();

function renderList(
  props: Partial<React.ComponentProps<typeof SessionExerciseList>> = {},
) {
  return render(
    <SessionExerciseList
      items={
        props.items ?? [
          item("a", "Жим лежачи", [[80, 8]]),
          item("b", "Присідання", [[0, 0]]),
        ]
      }
      groupOf={props.groupOf ?? new Map()}
      isReadOnly={props.isReadOnly ?? false}
      lastByExerciseId={props.lastByExerciseId ?? {}}
      recBy={props.recBy ?? {}}
      onOpenItem={onOpenItem}
      onAddExercise={onAddExercise}
      selectMode={props.selectMode ?? false}
      selected={props.selected ?? new Set()}
      onToggleSelect={onToggleSelect}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SessionExerciseList", () => {
  it("shows one fact per row: done sets with the last set, or the previous-session target", () => {
    renderList({
      items: [
        item("a", "Жим лежачи", [
          [80, 8],
          [80, 8],
        ]),
        item("b", "Присідання", [[0, 0]]),
      ],
      lastByExerciseId: {
        b: {
          id: "prev",
          exerciseId: "b",
          nameUk: "Присідання",
          type: "strength",
          primaryGroup: "legs",
          musclesPrimary: [],
          musclesSecondary: [],
          sets: [{ weightKg: 100, reps: 5 }],
        },
      },
    });
    expect(screen.getByText("2 з 2 підходів · 80 кг × 8")).toBeInTheDocument();
    expect(screen.getByText("Минулого разу: 100 кг × 5")).toBeInTheDocument();
  });

  it("surfaces a red recovery warning as the row fact", () => {
    renderList({
      recBy: { pec: { status: "red", label: "Груди", daysSince: 1 } },
    });
    expect(screen.getAllByText("Ще рано: Груди").length).toBeGreaterThan(0);
  });

  it("labels superset members A1/A2", () => {
    const g: WorkoutGroup = {
      id: "g",
      type: "superset",
      itemIds: ["a", "b"],
      restSec: 60,
    };
    renderList({
      groupOf: new Map([
        ["a", g],
        ["b", g],
      ]),
    });
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("A2")).toBeInTheDocument();
  });

  it("turns rows into checkboxes in select mode and hides «+ Вправа»", () => {
    renderList({ selectMode: true, selected: new Set(["a"]) });
    const a = screen.getByRole("checkbox", { name: /Жим лежачи/ });
    expect(a).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("checkbox", { name: /Присідання/ }));
    expect(onToggleSelect).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("button", { name: "Додати вправу" })).toBeNull();
  });

  it("hides «+ Вправа» in read-only mode", () => {
    renderList({ isReadOnly: true });
    expect(screen.queryByRole("button", { name: "Додати вправу" })).toBeNull();
  });
});
