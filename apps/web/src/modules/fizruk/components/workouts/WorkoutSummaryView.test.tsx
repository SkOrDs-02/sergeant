// @vitest-environment jsdom
/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Workout } from "@sergeant/fizruk-domain/domain";
import { WorkoutSummaryView } from "./WorkoutSummaryView";

function makeWorkout(override: Partial<Workout> = {}): Workout {
  return {
    id: "w1",
    startedAt: new Date("2025-03-10T10:00:00Z").toISOString(),
    endedAt: new Date("2025-03-10T11:00:00Z").toISOString(),
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
    ...override,
  };
}

describe("WorkoutSummaryView", () => {
  it("shows the finished-workout title, duration and the three stat tiles", () => {
    render(<WorkoutSummaryView workout={makeWorkout()} onRepeat={vi.fn()} />);
    expect(screen.getByText("Тренування завершено")).toBeInTheDocument();
    expect(screen.getByText("Вправ")).toBeInTheDocument();
    expect(screen.getByText("Підходів")).toBeInTheDocument();
    expect(screen.getByText("Обʼєм")).toBeInTheDocument();
  });

  it("renders the exercise list with per-item set details", () => {
    const workout = makeWorkout({
      items: [
        {
          id: "i1",
          exerciseId: "bench",
          nameUk: "Жим лежачи",
          primaryGroup: "chest",
          musclesPrimary: [],
          musclesSecondary: [],
          type: "strength",
          sets: [
            { weightKg: 40, reps: 8 },
            { weightKg: 45, reps: 6 },
          ],
        },
      ],
    });
    render(<WorkoutSummaryView workout={workout} onRepeat={vi.fn()} />);
    expect(screen.getByText("Жим лежачи")).toBeInTheDocument();
    expect(screen.getByText("40×8, 45×6")).toBeInTheDocument();
  });

  it("shows the wellbeing row only when energy or mood was recorded", () => {
    const { rerender } = render(
      <WorkoutSummaryView workout={makeWorkout()} onRepeat={vi.fn()} />,
    );
    expect(screen.queryByText(/Самопочуття/)).not.toBeInTheDocument();

    rerender(
      <WorkoutSummaryView
        workout={makeWorkout({ wellbeing: { energy: 4, mood: 5 } })}
        onRepeat={vi.fn()}
      />,
    );
    expect(screen.getByText(/Самопочуття/)).toBeInTheDocument();
    expect(screen.getByText(/енергія 4\/5/)).toBeInTheDocument();
    expect(screen.getByText(/настрій 5\/5/)).toBeInTheDocument();
  });

  it("shows the note only when present", () => {
    const { rerender } = render(
      <WorkoutSummaryView workout={makeWorkout()} onRepeat={vi.fn()} />,
    );
    expect(screen.queryByText("Нотатка")).not.toBeInTheDocument();

    rerender(
      <WorkoutSummaryView
        workout={makeWorkout({ note: "Важко на присіданнях" })}
        onRepeat={vi.fn()}
      />,
    );
    expect(screen.getByText("Нотатка")).toBeInTheDocument();
    expect(screen.getByText("Важко на присіданнях")).toBeInTheDocument();
  });

  it("calls onRepeat from the Повторити CTA", () => {
    const onRepeat = vi.fn();
    render(<WorkoutSummaryView workout={makeWorkout()} onRepeat={onRepeat} />);
    screen.getByRole("button", { name: /повторити це тренування/i }).click();
    expect(onRepeat).toHaveBeenCalledTimes(1);
  });
});
