// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type {
  Workout,
  WorkoutGroup,
  WorkoutItem,
} from "@sergeant/fizruk-domain";

vi.mock("./WorkoutItemCard", () => ({
  WorkoutItemCard: ({
    it,
    group,
    groupSelectMode,
    isSelected,
  }: {
    it: WorkoutItem;
    group?: WorkoutGroup;
    groupSelectMode: boolean;
    isSelected: boolean;
  }) => (
    <div
      data-testid="workout-item-card"
      data-group-id={group?.id ?? ""}
      data-select-mode={String(groupSelectMode)}
      data-selected={String(isSelected)}
    >
      {it.nameUk}
    </div>
  ),
}));

import { WorkoutItemsList } from "./WorkoutItemsList";

const updateWorkout = vi.fn();
const updateItem = vi.fn();
const removeItem = vi.fn();
const setRestTimer = vi.fn();
const onToggleGroupSelect = vi.fn();
const onDeleteSet = vi.fn();

function makeItem(overrides: Partial<WorkoutItem> = {}): WorkoutItem {
  return {
    id: "i1",
    exerciseId: "bench",
    nameUk: "Жим лежачи",
    type: "strength",
    primaryGroup: "chest",
    musclesPrimary: ["pec"],
    musclesSecondary: [],
    sets: [],
    ...overrides,
  } as WorkoutItem;
}

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "w1",
    startedAt: "2026-06-22T10:00:00Z",
    endedAt: null,
    note: "",
    items: [],
    groups: [],
    ...overrides,
  } as Workout;
}

function renderList(
  overrides: Partial<React.ComponentProps<typeof WorkoutItemsList>> = {},
) {
  const items = overrides.items ?? [
    makeItem(),
    makeItem({ id: "i2", nameUk: "Тяга" }),
  ];
  const groups = overrides.groups ?? [];
  return render(
    <WorkoutItemsList
      activeWorkout={overrides.activeWorkout ?? makeWorkout({ items, groups })}
      items={items}
      groups={groups}
      groupSelectMode={overrides.groupSelectMode ?? false}
      groupSelected={overrides.groupSelected ?? new Set<string>()}
      isReadOnly={overrides.isReadOnly ?? false}
      lastByExerciseId={{}}
      musclesUk={{ pec: "Грудні" }}
      recBy={{}}
      onToggleGroupSelect={onToggleGroupSelect}
      removeItem={removeItem}
      updateItem={updateItem}
      updateWorkout={updateWorkout}
      setRestTimer={setRestTimer}
      getDefaultForGroup={() => 90}
      onDeleteSet={onDeleteSet}
      {...overrides}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WorkoutItemsList", () => {
  it("renders the empty-state message when there are no items", () => {
    renderList({ items: [] });

    expect(
      screen.getByText("Додай вправи, щоб почати логувати"),
    ).toBeInTheDocument();
  });

  it("passes select-mode state to standalone item cards", () => {
    renderList({
      groupSelectMode: true,
      groupSelected: new Set(["i2"]),
    });

    const cards = screen.getAllByTestId("workout-item-card");
    expect(cards[0]).toHaveAttribute("data-select-mode", "true");
    expect(cards[0]).toHaveAttribute("data-selected", "false");
    expect(cards[1]).toHaveAttribute("data-selected", "true");
  });

  it("renders grouped items once with shared rest controls", () => {
    const groups: WorkoutGroup[] = [
      { id: "g1", type: "circuit", itemIds: ["i1", "i2"], restSec: 120 },
    ];
    renderList({ groups });

    expect(screen.getByText("2 вправи разом")).toBeInTheDocument();
    expect(
      screen.getByText("Спільний таймер відпочинку між колами"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "120 с ★" })).toBeInTheDocument();
    expect(screen.getAllByTestId("workout-item-card")).toHaveLength(2);
  });

  it("updates and starts the shared group rest timer from quick options", () => {
    const groups: WorkoutGroup[] = [
      { id: "g1", type: "superset", itemIds: ["i1", "i2"], restSec: 60 },
    ];
    renderList({ groups });

    fireEvent.click(screen.getByRole("button", { name: "90 с" }));

    expect(updateWorkout).toHaveBeenCalledWith("w1", {
      groups: [{ ...groups[0], restSec: 90 }],
    });
    expect(setRestTimer).toHaveBeenCalledWith({ remaining: 90, total: 90 });
  });

  it("starts the recommended shared timer and removes a group", () => {
    const groups: WorkoutGroup[] = [
      { id: "g1", type: "superset", itemIds: ["i1", "i2"], restSec: 60 },
      { id: "g2", type: "circuit", itemIds: ["i3"], restSec: 90 },
    ];
    renderList({ groups });

    fireEvent.click(screen.getByRole("button", { name: "60 с ★" }));
    fireEvent.click(screen.getByRole("button", { name: "Розгрупувати" }));

    expect(setRestTimer).toHaveBeenCalledWith({ remaining: 60, total: 60 });
    expect(updateWorkout).toHaveBeenCalledWith("w1", {
      groups: [groups[1]],
    });
  });

  it("hides shared rest controls for completed workouts", () => {
    const groups: WorkoutGroup[] = [
      { id: "g1", type: "superset", itemIds: ["i1", "i2"], restSec: 60 },
    ];
    renderList({
      activeWorkout: makeWorkout({ endedAt: "2026-06-22T11:00:00Z" }),
      groups,
    });

    expect(
      screen.queryByText("Спільний таймер відпочинку між колами"),
    ).not.toBeInTheDocument();
  });
});
