// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type {
  ChecklistItem,
  Workout,
  WorkoutSet,
} from "@sergeant/fizruk-domain";

vi.mock("../../hooks/useRestSettings", () => ({
  useRestSettings: () => ({ getDefaultForGroup: () => 90 }),
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ push: vi.fn() }),
}));

vi.mock("@shared/components/ui/CelebrationModal", () => ({
  useCelebration: () => ({ CelebrationComponent: null }),
}));

vi.mock("@shared/lib/ui/undoToast", () => ({
  showUndoToast: vi.fn(
    (_toast: unknown, opts: { msg: string; onUndo: () => void }) => {
      opts.onUndo();
    },
  ),
}));

vi.mock("./ActiveWorkoutHeader", () => ({
  ActiveWorkoutHeader: ({
    onFinishClick,
    onDeleteWorkout,
    onCollapse,
  }: {
    onFinishClick: () => void;
    onDeleteWorkout: () => void;
    onCollapse?: () => void;
  }) => (
    <div data-testid="active-workout-header">
      <button type="button" onClick={onFinishClick}>
        finish
      </button>
      <button type="button" onClick={onDeleteWorkout}>
        delete-workout
      </button>
      <button type="button" onClick={onCollapse}>
        collapse
      </button>
    </div>
  ),
}));

vi.mock("./WorkoutTimeEditor", () => ({
  WorkoutTimeEditor: ({
    activeWorkout,
    updateWorkout,
  }: {
    activeWorkout: Workout;
    updateWorkout: (id: string, patch: Partial<Workout>) => void;
  }) => (
    <button
      type="button"
      onClick={() => updateWorkout(activeWorkout.id, { note: "time edit" })}
    >
      edit-time
    </button>
  ),
}));

vi.mock("./WarmupCooldownChecklist", () => ({
  WarmupCooldownChecklist: ({
    title,
    items,
    onToggle,
    onInit,
  }: {
    title: string;
    items?: ChecklistItem[] | null;
    onToggle: (id: string) => void;
    onInit: () => void;
  }) => (
    <div data-testid={`checklist-${title}`}>
      <button type="button" onClick={onInit}>
        init {title}
      </button>
      <button type="button" onClick={() => onToggle(items?.[0]?.id ?? "seed")}>
        toggle {title}
      </button>
    </div>
  ),
}));

vi.mock("./WorkoutGroupingControls", () => ({
  WorkoutGroupingControls: ({
    selectedCount,
    selectMode,
    onEnterSelectMode,
    onCancelSelectMode,
    onCreateGroup,
  }: {
    selectedCount: number;
    selectMode: boolean;
    onEnterSelectMode: () => void;
    onCancelSelectMode: () => void;
    onCreateGroup: (type: "circuit" | "superset") => void;
  }) => (
    <div data-testid="grouping-controls" data-selected-count={selectedCount}>
      <span>{selectMode ? "selecting" : "idle"}</span>
      <button type="button" onClick={onEnterSelectMode}>
        enter-select
      </button>
      <button type="button" onClick={onCancelSelectMode}>
        cancel-select
      </button>
      <button type="button" onClick={() => onCreateGroup("superset")}>
        create-superset
      </button>
      <button type="button" onClick={() => onCreateGroup("circuit")}>
        create-circuit
      </button>
    </div>
  ),
}));

vi.mock("./WorkoutItemsList", () => ({
  WorkoutItemsList: ({
    onToggleGroupSelect,
    onDeleteSet,
  }: {
    onToggleGroupSelect: (itemId: string) => void;
    onDeleteSet: (
      workoutId: string,
      itemId: string,
      snapshot: WorkoutSet[],
    ) => void;
  }) => (
    <div data-testid="items-list">
      <button type="button" onClick={() => onToggleGroupSelect("i1")}>
        toggle-i1
      </button>
      <button type="button" onClick={() => onToggleGroupSelect("i2")}>
        toggle-i2
      </button>
      <button
        type="button"
        onClick={() => onDeleteSet("w1", "i1", [{ weightKg: 50, reps: 8 }])}
      >
        delete-set
      </button>
    </div>
  ),
}));

import { ActiveWorkoutPanel } from "./ActiveWorkoutPanel";

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "w1",
    startedAt: "2026-06-22T10:00:00Z",
    endedAt: null,
    note: "",
    items: [
      {
        id: "i1",
        exerciseId: "bench",
        nameUk: "Жим",
        type: "strength",
        primaryGroup: "chest",
        musclesPrimary: [],
        musclesSecondary: [],
        sets: [{ weightKg: 50, reps: 8 }],
      },
      {
        id: "i2",
        exerciseId: "row",
        nameUk: "Тяга",
        type: "strength",
        primaryGroup: "back",
        musclesPrimary: [],
        musclesSecondary: [],
        sets: [{ weightKg: 40, reps: 10 }],
      },
    ],
    groups: [
      { id: "old", type: "circuit", itemIds: ["i1"], restSec: 120 },
      { id: "keep", type: "superset", itemIds: ["other"], restSec: 90 },
    ],
    warmup: [{ id: "warm-1", label: "Кардіо", done: false }],
    cooldown: [{ id: "cool-1", label: "Розтяжка", done: true }],
    ...overrides,
  } as Workout;
}

function baseProps() {
  return {
    activeDuration: "20 хв",
    lastByExerciseId: {},
    musclesUk: {},
    recBy: {},
    removeItem: vi.fn(),
    updateItem: vi.fn(),
    updateWorkout: vi.fn(),
    setRestTimer: vi.fn(),
    onFinishClick: vi.fn(),
    onDeleteWorkout: vi.fn(),
    onCollapse: vi.fn(),
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActiveWorkoutPanel coordination", () => {
  it("wires header, time editor, warmup, and cooldown callbacks", () => {
    const props = baseProps();
    render(<ActiveWorkoutPanel activeWorkout={makeWorkout()} {...props} />);

    fireEvent.click(screen.getByText("finish"));
    fireEvent.click(screen.getByText("delete-workout"));
    fireEvent.click(screen.getByText("collapse"));
    fireEvent.click(screen.getByText("edit-time"));
    fireEvent.click(screen.getByText("toggle Розминка"));
    fireEvent.click(screen.getByText("toggle Заминка / розтяжка"));
    fireEvent.click(screen.getByText("init Розминка"));
    fireEvent.click(screen.getByText("init Заминка / розтяжка"));

    expect(props.onFinishClick).toHaveBeenCalledTimes(1);
    expect(props.onDeleteWorkout).toHaveBeenCalledTimes(1);
    expect(props.onCollapse).toHaveBeenCalledTimes(1);
    expect(props.updateWorkout).toHaveBeenCalledWith("w1", {
      note: "time edit",
    });
    expect(props.updateWorkout).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ warmup: expect.any(Array) }),
    );
    expect(props.updateWorkout).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ cooldown: expect.any(Array) }),
    );
  });

  it("creates a superset from selected items and filters overlapping groups", () => {
    const props = baseProps();
    render(<ActiveWorkoutPanel activeWorkout={makeWorkout()} {...props} />);

    fireEvent.click(screen.getByText("enter-select"));
    fireEvent.click(screen.getByText("toggle-i1"));
    fireEvent.click(screen.getByText("toggle-i2"));
    fireEvent.click(screen.getByText("create-superset"));

    expect(props.updateWorkout).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({
        groups: expect.arrayContaining([
          expect.objectContaining({
            type: "superset",
            itemIds: ["i1", "i2"],
            restSec: 60,
          }),
          expect.objectContaining({ id: "keep" }),
        ]),
      }),
    );
  });

  it("ignores invalid group sizes and cancels select mode", () => {
    const props = baseProps();
    render(<ActiveWorkoutPanel activeWorkout={makeWorkout()} {...props} />);

    fireEvent.click(screen.getByText("enter-select"));
    fireEvent.click(screen.getByText("toggle-i1"));
    fireEvent.click(screen.getByText("create-circuit"));
    fireEvent.click(screen.getByText("cancel-select"));

    expect(props.updateWorkout).not.toHaveBeenCalled();
    expect(screen.getByText("idle")).toBeInTheDocument();
  });

  it("restores a deleted set through the undo toast callback", () => {
    const props = baseProps();
    render(<ActiveWorkoutPanel activeWorkout={makeWorkout()} {...props} />);

    fireEvent.click(screen.getByText("delete-set"));

    expect(props.updateItem).toHaveBeenCalledWith("w1", "i1", {
      sets: [{ weightKg: 50, reps: 8 }],
    });
  });
});
