/** @vitest-environment jsdom */
/**
 * Last validated: 2026-08-31
 * Status: Active
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WorkoutItemNextSetHint } from "./WorkoutItemNextSetHint";
import type { LastByExerciseEntry } from "./WorkoutItemLastTimeHint";

afterEach(cleanup);

function lastStrength(
  daysAgo: number,
  sets = [{ weightKg: 80, reps: 8 }],
): LastByExerciseEntry {
  return {
    id: "item-1",
    exerciseId: "bench_press_barbell",
    nameUk: "Жим штанги лежачи",
    primaryGroup: "chest",
    type: "strength",
    sets,
    _startedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  } as unknown as LastByExerciseEntry;
}

describe("WorkoutItemNextSetHint", () => {
  it("suggests the next set from the last session", () => {
    const onApply = vi.fn();
    render(
      <WorkoutItemNextSetHint
        last={lastStrength(3)}
        exerciseId="bench_press_barbell"
        isReadOnly={false}
        onApply={onApply}
      />,
    );
    // Штанга + груди → діапазон 5-8, стеля досягнута: +2.5 кг і назад на 5.
    const chip = screen.getByRole("button", { name: /Наступний/ });
    expect(chip.textContent).toMatch(/82[.,]5/);
    expect(chip.textContent).toMatch(/× 5/);
    expect(screen.getByText(/ціль 5-8 повторень/)).toBeInTheDocument();

    fireEvent.click(chip);
    expect(onApply).toHaveBeenCalledWith(82.5, 5);
  });

  it("does not raise the weight after a long layoff", () => {
    const onApply = vi.fn();
    render(
      <WorkoutItemNextSetHint
        last={lastStrength(60)}
        exerciseId="bench_press_barbell"
        isReadOnly={false}
        onApply={onApply}
      />,
    );
    expect(screen.getByText(/легше після паузи/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Наступний/ }));
    const [weight] = onApply.mock.calls[0] as [number, number];
    expect(weight).toBeLessThan(80);
  });

  it("stays silent without history, on cardio items, and when read-only", () => {
    const { container, rerender } = render(
      <WorkoutItemNextSetHint
        last={undefined}
        exerciseId="bench_press_barbell"
        isReadOnly={false}
        onApply={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();

    rerender(
      <WorkoutItemNextSetHint
        last={{ type: "time", durationSec: 60 } as never}
        exerciseId="plank"
        isReadOnly={false}
        onApply={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();

    rerender(
      <WorkoutItemNextSetHint
        last={lastStrength(3)}
        exerciseId="bench_press_barbell"
        isReadOnly
        onApply={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("ignores empty sets when picking the reference set", () => {
    const onApply = vi.fn();
    render(
      <WorkoutItemNextSetHint
        last={lastStrength(3, [
          { weightKg: 0, reps: 0 },
          { weightKg: 60, reps: 6 },
        ])}
        exerciseId="bench_press_barbell"
        isReadOnly={false}
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Наступний/ }));
    // 6 повторень усередині 5-8 → та сама вага, +1 повторення.
    expect(onApply).toHaveBeenCalledWith(60, 7);
  });
});
