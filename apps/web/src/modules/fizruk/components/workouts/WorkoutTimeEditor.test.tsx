// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Workout } from "@sergeant/fizruk-domain";
import { WorkoutTimeEditor } from "./WorkoutTimeEditor";

function baseWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "w-1",
    startedAt: "2026-07-01T10:00:00.000Z",
    endedAt: null,
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
    ...overrides,
  } as Workout;
}

describe("WorkoutTimeEditor", () => {
  beforeEach(cleanup);

  it("only renders the start-time input when the workout has not ended", () => {
    render(
      <WorkoutTimeEditor
        activeWorkout={baseWorkout()}
        updateWorkout={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Початок")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Завершення/)).not.toBeInTheDocument();
  });

  it("also renders the end-time input once the workout has ended", () => {
    render(
      <WorkoutTimeEditor
        activeWorkout={baseWorkout({ endedAt: "2026-07-01T11:00:00.000Z" })}
        updateWorkout={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Початок")).toBeInTheDocument();
    expect(screen.getByLabelText(/Завершення/)).toBeInTheDocument();
  });

  it("calls updateWorkout with a new startedAt ISO string on a valid start-time change", () => {
    const updateWorkout = vi.fn();
    render(
      <WorkoutTimeEditor
        activeWorkout={baseWorkout()}
        updateWorkout={updateWorkout}
      />,
    );
    fireEvent.change(screen.getByLabelText("Початок"), {
      target: { value: "2026-07-02T09:30" },
    });
    expect(updateWorkout).toHaveBeenCalledTimes(1);
    const [id, patch] = updateWorkout.mock.calls[0]!;
    expect(id).toBe("w-1");
    expect(patch).toEqual({
      startedAt: new Date("2026-07-02T09:30").toISOString(),
    });
  });

  it("does not call updateWorkout when the start-time input is cleared to an empty/unparseable value", () => {
    const updateWorkout = vi.fn();
    render(
      <WorkoutTimeEditor
        activeWorkout={baseWorkout()}
        updateWorkout={updateWorkout}
      />,
    );
    fireEvent.change(screen.getByLabelText("Початок"), {
      target: { value: "" },
    });
    expect(updateWorkout).not.toHaveBeenCalled();
  });

  it("calls updateWorkout with a new endedAt ISO string on a valid end-time change", () => {
    const updateWorkout = vi.fn();
    render(
      <WorkoutTimeEditor
        activeWorkout={baseWorkout({ endedAt: "2026-07-01T11:00:00.000Z" })}
        updateWorkout={updateWorkout}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Завершення/), {
      target: { value: "2026-07-01T12:15" },
    });
    expect(updateWorkout).toHaveBeenCalledWith("w-1", {
      endedAt: new Date("2026-07-01T12:15").toISOString(),
    });
  });

  it("clears endedAt to null when the end-time input is emptied", () => {
    const updateWorkout = vi.fn();
    render(
      <WorkoutTimeEditor
        activeWorkout={baseWorkout({ endedAt: "2026-07-01T11:00:00.000Z" })}
        updateWorkout={updateWorkout}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Завершення/), {
      target: { value: "" },
    });
    expect(updateWorkout).toHaveBeenCalledWith("w-1", { endedAt: null });
  });
});
