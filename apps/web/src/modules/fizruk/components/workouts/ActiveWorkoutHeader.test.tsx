// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Workout } from "@sergeant/fizruk-domain";
import { ActiveWorkoutHeader } from "./ActiveWorkoutHeader";

const NOW = new Date("2025-03-04T08:00:00Z").toISOString();

function baseWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "w-1",
    startedAt: NOW,
    endedAt: null,
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
    ...overrides,
  } as Workout;
}

describe("ActiveWorkoutHeader", () => {
  beforeEach(cleanup);

  it("shows the Завершити button while the workout is in flight", () => {
    const onFinish = vi.fn();
    render(
      <ActiveWorkoutHeader
        activeWorkout={baseWorkout()}
        activeDuration="42 хв"
        onFinishClick={onFinish}
        onDeleteWorkout={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Завершити" }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/42 хв/)).toBeTruthy();
    expect(screen.getByText("Активне тренування")).toBeTruthy();
  });

  it("renders Згорнути when the workout is finished and onCollapse is provided", () => {
    const onCollapse = vi.fn();
    render(
      <ActiveWorkoutHeader
        activeWorkout={baseWorkout({
          endedAt: new Date("2025-03-04T09:00:00Z").toISOString(),
        })}
        activeDuration={null}
        onFinishClick={vi.fn()}
        onDeleteWorkout={vi.fn()}
        onCollapse={onCollapse}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Згорнути/ }));
    expect(onCollapse).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Завершене тренування")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Завершити" })).toBeNull();
  });

  it("falls back to the 'Завершено' label when there is no onCollapse handler", () => {
    render(
      <ActiveWorkoutHeader
        activeWorkout={baseWorkout({
          endedAt: new Date("2025-03-04T09:00:00Z").toISOString(),
        })}
        activeDuration={null}
        onFinishClick={vi.fn()}
        onDeleteWorkout={vi.fn()}
      />,
    );

    expect(screen.getByText("Завершено")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Згорнути/ })).toBeNull();
  });

  it("invokes onDeleteWorkout from the Видалити button", () => {
    const onDelete = vi.fn();
    render(
      <ActiveWorkoutHeader
        activeWorkout={baseWorkout()}
        activeDuration={null}
        onFinishClick={vi.fn()}
        onDeleteWorkout={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Видалити" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
