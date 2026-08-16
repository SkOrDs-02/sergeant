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

  it("несе введені мітки в summary, а не самий лише підпис", () => {
    // Скарга тестера 2026-08-16: згорнутий блок із самим «Час тренування»
    // читався як ПОРОЖНЄ поле, що просить той самий час удруге.
    render(
      <WorkoutTimeEditor
        activeWorkout={baseWorkout()}
        updateWorkout={vi.fn()}
        pendingEndedAt="2026-07-01T10:50:00.000Z"
        onPendingEndChange={vi.fn()}
      />,
    );
    const summary = screen.getByText("Час тренування").closest("summary");
    expect(summary).not.toBeNull();
    // Години беруться з локального годинника раннера, тож пінимо форму вікна
    // «початок → кінець», а не конкретні цифри.
    expect(summary!.textContent).toMatch(/\d{1,2}:\d{2}\s*→\s*\d{1,2}:\d{2}/);
  });

  it("без відомого кінця summary каже «з <початок>», а не мовчить", () => {
    render(
      <WorkoutTimeEditor
        activeWorkout={baseWorkout()}
        updateWorkout={vi.fn()}
      />,
    );
    const summary = screen.getByText("Час тренування").closest("summary");
    expect(summary!.textContent).toMatch(/з \d{1,2}:\d{2}/);
  });

  it("показує відкладений ретро-кінець ще до кроку «Завершити»", () => {
    // Друга половина тієї ж скарги: мітка, яку людина щойно ввела у формі,
    // ховалась за умовою `endedAt ?` і виглядала як загублена.
    render(
      <WorkoutTimeEditor
        activeWorkout={baseWorkout()}
        updateWorkout={vi.fn()}
        pendingEndedAt="2026-07-01T10:50:00.000Z"
        onPendingEndChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Завершення/)).toBeInTheDocument();
  });

  it("правку відкладеного кінця віддає в onPendingEndChange, не в updateWorkout", () => {
    const updateWorkout = vi.fn();
    const onPendingEndChange = vi.fn();
    render(
      <WorkoutTimeEditor
        activeWorkout={baseWorkout()}
        updateWorkout={updateWorkout}
        pendingEndedAt="2026-07-01T10:50:00.000Z"
        onPendingEndChange={onPendingEndChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Завершення/), {
      target: { value: "2026-07-01T12:15" },
    });
    expect(onPendingEndChange).toHaveBeenCalledWith(
      new Date("2026-07-01T12:15").toISOString(),
    );
    // Ретро-сесія мусить лишитись НЕзавершеною — інакше вона одразу
    // намалюється read-only підсумком і повз післятренувальний потік.
    expect(updateWorkout).not.toHaveBeenCalled();
  });

  it("записаний endedAt виграє над відкладеною міткою", () => {
    const updateWorkout = vi.fn();
    const onPendingEndChange = vi.fn();
    render(
      <WorkoutTimeEditor
        activeWorkout={baseWorkout({ endedAt: "2026-07-01T11:00:00.000Z" })}
        updateWorkout={updateWorkout}
        pendingEndedAt="2026-07-01T10:50:00.000Z"
        onPendingEndChange={onPendingEndChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Завершення/), {
      target: { value: "2026-07-01T12:15" },
    });
    expect(updateWorkout).toHaveBeenCalledWith("w-1", {
      endedAt: new Date("2026-07-01T12:15").toISOString(),
    });
    expect(onPendingEndChange).not.toHaveBeenCalled();
  });
});
