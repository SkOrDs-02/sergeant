// @vitest-environment jsdom
/**
 * WorkoutItemCard за типом виміру (спека `fizruk-exercise-measure-type.md`,
 * зріз 4): утримання й дистанція — справжні рядки підходів із полями
 * секунд і метрів, а не одне число на вправу.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Workout, WorkoutItem } from "@sergeant/fizruk-domain";
import { WorkoutItemCard } from "./WorkoutItemCard";

const updateItem = vi.fn();
const setRestTimer = vi.fn();
const onMeasureChosen = vi.fn();

function hold(sets: WorkoutItem["sets"]): WorkoutItem {
  return {
    id: "it-1",
    exerciseId: "plank",
    nameUk: "Планка",
    type: "time",
    measure: "time",
    primaryGroup: "core",
    musclesPrimary: [],
    musclesSecondary: [],
    sets,
  } as WorkoutItem;
}

const workout = {
  id: "w1",
  startedAt: "2026-11-18T10:00:00Z",
  endedAt: null,
  note: "",
  items: [],
  groups: [],
} as unknown as Workout;

function renderCard(it: WorkoutItem) {
  return render(
    <WorkoutItemCard
      it={it}
      activeWorkout={workout}
      group={null}
      isReadOnly={false}
      lastByExerciseId={{}}
      recBy={{}}
      injurySites={new Set<never>()}
      updateItem={updateItem}
      setRestTimer={setRestTimer}
      getDefaultForGroup={() => 60}
      onDeleteSet={vi.fn()}
      onMeasureChosen={onMeasureChosen}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WorkoutItemCard — підходи на час", () => {
  it("три рядки з полем секунд, без поля ваги й повторень", () => {
    renderCard(hold([0, 0, 0].map(() => ({ weightKg: 0, reps: 0 }))));
    expect(screen.getAllByLabelText("Секунди підходу")).toHaveLength(3);
    expect(screen.queryByLabelText("Вага в кілограмах")).toBeNull();
    expect(screen.queryByLabelText("Кількість повторень")).toBeNull();
  });

  it("введені секунди йдуть у підхід", () => {
    renderCard(hold([{ weightKg: 0, reps: 0 }]));
    fireEvent.change(screen.getByLabelText("Секунди підходу"), {
      target: { value: "30" },
    });
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [{ weightKg: 0, reps: 0, durationSec: 30 }],
    });
  });

  it("число понад стелю — стеля в підході й помилка біля поля", () => {
    renderCard(hold([{ weightKg: 0, reps: 0 }]));
    fireEvent.change(screen.getByLabelText("Секунди підходу"), {
      target: { value: "99999" },
    });
    expect(updateItem).toHaveBeenCalledWith("w1", "it-1", {
      sets: [{ weightKg: 0, reps: 0, durationSec: 86_400 }],
    });
    expect(screen.getByRole("alert").textContent).toMatch(/86400 с/);
  });

  it("✓ на зарахованому утриманні стартує відпочинок, перемикач ховається", () => {
    renderCard(
      hold([
        { weightKg: 0, reps: 0, durationSec: 30 },
        { weightKg: 0, reps: 0 },
      ]),
    );
    expect(screen.queryByRole("radio", { name: "Час: секунди" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Підхід 1: зроблено/ }));
    expect(setRestTimer).toHaveBeenCalled();
  });

  it("перемикач до першого підходу пише тип і памʼять вибору", () => {
    renderCard(hold([{ weightKg: 0, reps: 0 }]));
    fireEvent.click(screen.getByRole("radio", { name: "Лише повтори" }));
    expect(updateItem).toHaveBeenCalledWith(
      "w1",
      "it-1",
      expect.objectContaining({ measure: "reps", type: "strength" }),
    );
    expect(onMeasureChosen).toHaveBeenCalledWith("plank", "reps");
  });
});

describe("WorkoutItemCard — дистанція × час", () => {
  it("рядок має поля метрів і секунд", () => {
    renderCard({
      ...hold([{ weightKg: 0, reps: 0 }]),
      exerciseId: "run",
      type: "distance",
      measure: "distance_time",
    } as WorkoutItem);
    expect(screen.getByLabelText("Метри підходу")).toBeTruthy();
    expect(screen.getByLabelText("Секунди підходу")).toBeTruthy();
  });
});
