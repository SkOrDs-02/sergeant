// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Workout, WorkoutItem } from "@sergeant/fizruk-domain";

const parseWorkoutSetSpeech = vi.fn();

vi.mock("@sergeant/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sergeant/shared")>();
  return {
    ...actual,
    parseWorkoutSetSpeech: (transcript: string) =>
      parseWorkoutSetSpeech(transcript),
  };
});

vi.mock("@shared/components/ui/VoiceMicButton", () => ({
  VoiceMicButton: ({
    onResult,
  }: {
    onResult: (transcript: string) => void;
  }) => (
    <div data-testid="voice-mic">
      <button type="button" onClick={() => onResult("valid set")}>
        voice-valid
      </button>
      <button type="button" onClick={() => onResult("empty set")}>
        voice-empty
      </button>
    </div>
  ),
}));

import { WorkoutItemCard } from "./WorkoutItemCard";

const updateItem = vi.fn();
const setRestTimer = vi.fn();

function makeItem(overrides: Partial<WorkoutItem> = {}): WorkoutItem {
  return {
    id: "it-1",
    exerciseId: "bench",
    nameUk: "Жим лежачи",
    type: "strength",
    primaryGroup: "chest",
    musclesPrimary: ["pec"],
    musclesSecondary: [],
    sets: [{ weightKg: 50, reps: 8 }],
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

function renderCard(
  overrides: Partial<React.ComponentProps<typeof WorkoutItemCard>> = {},
) {
  return render(
    <MemoryRouter initialEntries={["/fizruk/workouts"]}>
      <WorkoutItemCard
        it={overrides.it ?? makeItem()}
        activeWorkout={overrides.activeWorkout ?? makeWorkout()}
        group={overrides.group ?? null}
        groupSelectMode={false}
        isSelected={false}
        isReadOnly={overrides.isReadOnly ?? false}
        lastByExerciseId={{}}
        musclesUk={{ pec: "Грудні" }}
        recBy={{}}
        onToggleGroupSelect={vi.fn()}
        removeItem={vi.fn()}
        updateItem={updateItem}
        setRestTimer={setRestTimer}
        getDefaultForGroup={() => 90}
        onDeleteSet={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WorkoutItemCard voice set entry", () => {
  it("appends a parsed voice set and starts rest timer", () => {
    parseWorkoutSetSpeech.mockReturnValue({ weight: 80, reps: 6, sets: null });
    renderCard();

    fireEvent.click(screen.getByText("voice-valid"));

    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [
        { weightKg: 50, reps: 8 },
        { weightKg: 80, reps: 6 },
      ],
    });
    expect(setRestTimer).toHaveBeenCalledWith({ remaining: 90, total: 90 });
  });

  it("ignores empty voice parses", () => {
    parseWorkoutSetSpeech.mockReturnValue({
      weight: null,
      reps: null,
      sets: null,
    });
    renderCard();

    fireEvent.click(screen.getByText("voice-empty"));

    expect(updateItem).not.toHaveBeenCalled();
    expect(setRestTimer).not.toHaveBeenCalled();
  });

  it("does not start rest timer for grouped voice entries", () => {
    parseWorkoutSetSpeech.mockReturnValue({
      weight: null,
      reps: 12,
      sets: null,
    });
    renderCard({
      group: { id: "g1", type: "superset", itemIds: ["it-1"], restSec: 60 },
    });

    fireEvent.click(screen.getByText("voice-valid"));

    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [
        { weightKg: 50, reps: 8 },
        { weightKg: 0, reps: 12 },
      ],
    });
    expect(setRestTimer).not.toHaveBeenCalled();
  });

  it("covers empty input values for strength, time, and distance fields", () => {
    renderCard();
    fireEvent.change(screen.getByLabelText("Вага в кілограмах"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Кількість повторень"), {
      target: { value: "" },
    });
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [{ weightKg: 0, reps: 8 }],
    });
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [{ weightKg: 50, reps: 0 }],
    });

    cleanup();
    renderCard({ it: makeItem({ type: "time", durationSec: 60, sets: [] }) });
    fireEvent.change(screen.getByLabelText("Тривалість у секундах"), {
      target: { value: "" },
    });
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", { durationSec: 0 });

    cleanup();
    renderCard({
      it: makeItem({
        type: "distance",
        distanceM: 1000,
        durationSec: 300,
        sets: [],
      }),
    });
    fireEvent.change(screen.getByLabelText("Дистанція в метрах"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Тривалість у секундах"), {
      target: { value: "" },
    });
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", { distanceM: 0 });
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", { durationSec: 0 });
  });
});
