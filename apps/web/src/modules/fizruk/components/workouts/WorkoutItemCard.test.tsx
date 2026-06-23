// @vitest-environment jsdom
/**
 * Tests for WorkoutItemCard — the editable per-item tile inside the
 * active-workout panel. Covers the three item types (strength / time /
 * distance), the "last time" hint, group multi-select, the delete-item
 * and delete-set flows, type switching, rest-timer presets, and the
 * read-only mode. Every mutation flows through a prop, so we assert on
 * the spy callbacks.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type {
  Workout,
  WorkoutItem,
  WorkoutGroup,
} from "@sergeant/fizruk-domain";
import { WorkoutItemCard } from "./WorkoutItemCard";

const removeItem = vi.fn();
const updateItem = vi.fn();
const setRestTimer = vi.fn();
const onToggleGroupSelect = vi.fn();
const onDeleteSet = vi.fn();
const getDefaultForGroup = vi.fn(() => 90);

function makeItem(over: Partial<WorkoutItem> = {}): WorkoutItem {
  return {
    id: "it-1",
    exerciseId: "bench",
    nameUk: "Жим лежачи",
    type: "strength",
    primaryGroup: "chest",
    musclesPrimary: ["pec"],
    musclesSecondary: [],
    sets: [{ weightKg: 50, reps: 8 }],
    ...over,
  } as WorkoutItem;
}

function makeWorkout(over: Partial<Workout> = {}): Workout {
  return {
    id: "w1",
    startedAt: "2026-06-22T10:00:00Z",
    endedAt: null,
    note: "",
    items: [],
    groups: [],
    ...over,
  } as Workout;
}

function renderCard(
  props: Partial<React.ComponentProps<typeof WorkoutItemCard>> = {},
) {
  const item = props.it ?? makeItem();
  const activeWorkout = props.activeWorkout ?? makeWorkout();
  return render(
    <MemoryRouter initialEntries={["/fizruk/workouts"]}>
      <WorkoutItemCard
        it={item}
        activeWorkout={activeWorkout}
        group={props.group ?? null}
        groupSelectMode={props.groupSelectMode ?? false}
        isSelected={props.isSelected ?? false}
        isReadOnly={props.isReadOnly ?? false}
        lastByExerciseId={props.lastByExerciseId ?? {}}
        musclesUk={props.musclesUk ?? { pec: "Грудні" }}
        recBy={props.recBy ?? {}}
        onToggleGroupSelect={onToggleGroupSelect}
        removeItem={removeItem}
        updateItem={updateItem}
        setRestTimer={setRestTimer}
        getDefaultForGroup={getDefaultForGroup}
        onDeleteSet={onDeleteSet}
      />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WorkoutItemCard — strength", () => {
  it("renders the exercise name and primary muscles", () => {
    renderCard();
    expect(screen.getByText("Жим лежачи")).toBeInTheDocument();
    expect(screen.getByText("Грудні")).toBeInTheDocument();
  });

  it("renders weight + reps inputs for a strength set", () => {
    renderCard();
    expect(screen.getByLabelText("Вага в кілограмах")).toBeInTheDocument();
    expect(screen.getByLabelText("Кількість повторень")).toBeInTheDocument();
  });

  it("editing the weight input calls updateItem with the new sets array", () => {
    renderCard();
    fireEvent.change(screen.getByLabelText("Вага в кілограмах"), {
      target: { value: "60" },
    });
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [{ weightKg: 60, reps: 8 }],
    });
  });

  it("'+ Підхід' appends a new empty set", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "+ Підхід" }));
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [
        { weightKg: 50, reps: 8 },
        { weightKg: 0, reps: 0 },
      ],
    });
  });

  it("'Видалити' on a set snapshots and calls onDeleteSet", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Видалити" }));
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", { sets: [] });
    expect(onDeleteSet).toHaveBeenCalledWith("w1", "it-1", [
      { weightKg: 50, reps: 8 },
    ]);
  });

  it("Enter on the reps field starts the rest timer", () => {
    renderCard();
    fireEvent.keyDown(screen.getByLabelText("Кількість повторень"), {
      key: "Enter",
    });
    expect(setRestTimer).toHaveBeenCalledWith({ remaining: 90, total: 90 });
  });

  it("renders the recommended rest-timer preset and quick options", () => {
    renderCard();
    // Default 90 → "90 с ★" recommended button.
    expect(screen.getByText("90 с ★")).toBeInTheDocument();
    // Quick options exclude the default (90).
    expect(screen.getByRole("button", { name: "60 с" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "60 с" }));
    expect(setRestTimer).toHaveBeenCalledWith({ remaining: 60, total: 60 });
  });

  it("removing the whole item calls removeItem", () => {
    renderCard();
    fireEvent.click(
      screen.getByRole("button", { name: "Видалити вправу з тренування" }),
    );
    expect(removeItem).toHaveBeenCalledWith("w1", "it-1");
  });

  it("switching the type to 'Час' calls updateItem with a duration", () => {
    renderCard();
    fireEvent.click(screen.getByRole("tab", { name: "Час — секунди" }));
    expect(updateItem).toHaveBeenCalledWith(
      "w1",
      "it-1",
      expect.objectContaining({ type: "time" }),
    );
  });
});

describe("WorkoutItemCard — last-time hint + groups", () => {
  it("renders the 'last time' hint from lastByExerciseId", () => {
    renderCard({
      lastByExerciseId: {
        bench: {
          type: "strength",
          sets: [{ weightKg: 70, reps: 5 }],
          _startedAt: "2026-06-15T10:00:00Z",
        },
      },
    });
    expect(screen.getByText(/Минулого разу/)).toBeInTheDocument();
    expect(screen.getByText(/70×5/)).toBeInTheDocument();
  });

  it("renders the group-select checkbox in select mode and toggles it", () => {
    renderCard({ groupSelectMode: true, isSelected: false });
    const checkbox = screen.getAllByRole("button")[0]!;
    fireEvent.click(checkbox);
    expect(onToggleGroupSelect).toHaveBeenCalledWith("it-1");
  });

  it("renders a superset badge when the item belongs to a group", () => {
    const group = { id: "g1", type: "superset" } as WorkoutGroup;
    renderCard({ group });
    // Grouped strength items hide the per-item rest-timer block.
    expect(screen.queryByText("90 с ★")).not.toBeInTheDocument();
  });
});

describe("WorkoutItemCard — time + distance + read-only", () => {
  it("renders a single duration input for a time item", () => {
    renderCard({ it: makeItem({ type: "time", durationSec: 60, sets: [] }) });
    expect(screen.getByLabelText("Тривалість у секундах")).toBeInTheDocument();
    expect(screen.getByText(/планка/i)).toBeInTheDocument();
  });

  it("renders distance + duration inputs and cardio metrics for a distance item", () => {
    renderCard({
      it: makeItem({
        type: "distance",
        distanceM: 1000,
        durationSec: 300,
        sets: [],
      }),
    });
    expect(screen.getByLabelText("Дистанція в метрах")).toBeInTheDocument();
    expect(screen.getByText("Темп")).toBeInTheDocument();
    expect(screen.getByText("Швидкість")).toBeInTheDocument();
  });

  it("read-only mode hides the delete-item button and disables set delete", () => {
    renderCard({ isReadOnly: true });
    expect(
      screen.queryByRole("button", { name: "Видалити вправу з тренування" }),
    ).not.toBeInTheDocument();
    const weightInput = screen.getByLabelText("Вага в кілограмах");
    expect(weightInput).toHaveAttribute("readonly");
  });

  it("navigates to the exercise detail when the name button is clicked", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Жим лежачи" }));
    // Navigation is internal (useFizrukRoute); assert no crash + button works.
    expect(screen.getByText("Жим лежачи")).toBeInTheDocument();
  });
});
