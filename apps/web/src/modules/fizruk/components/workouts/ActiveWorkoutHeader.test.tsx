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
    // Підпис дублював заголовок сторінки над панеллю, тож його немає.
    expect(screen.queryByText("Активне тренування")).toBeNull();
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

  // V-8 (audit): "Видалити" used to sit directly next to "Завершити" in
  // the prime action row — same size, same gap, always visible. This
  // guards the regression by asserting the destructive action is NOT a
  // top-level button, and only reachable through the overflow menu.
  it("does not render Видалити as a direct top-level button", () => {
    render(
      <ActiveWorkoutHeader
        activeWorkout={baseWorkout()}
        activeDuration={null}
        onFinishClick={vi.fn()}
        onDeleteWorkout={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Видалити" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Видалити тренування" }),
    ).toBeNull();
  });

  it("invokes onDeleteWorkout from the Видалити menu item behind the overflow trigger", () => {
    const onDelete = vi.fn();
    render(
      <ActiveWorkoutHeader
        activeWorkout={baseWorkout()}
        activeDuration={null}
        onFinishClick={vi.fn()}
        onDeleteWorkout={onDelete}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Ще дії з тренуванням",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(
      screen.getByRole("menuitem", { name: "Видалити тренування" }),
    );
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  // Guards the a11y requirements from the V-8 fix: Escape and an outside
  // click must both close the menu without touching the destructive
  // action, so a stray tap/press-anywhere can never look like a delete.
  it("closes the overflow menu on Escape without invoking onDeleteWorkout", () => {
    const onDelete = vi.fn();
    render(
      <ActiveWorkoutHeader
        activeWorkout={baseWorkout()}
        activeDuration={null}
        onFinishClick={vi.fn()}
        onDeleteWorkout={onDelete}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Ще дії з тренуванням",
    });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("closes the overflow menu on an outside click without invoking onDeleteWorkout", () => {
    const onDelete = vi.fn();
    render(
      <ActiveWorkoutHeader
        activeWorkout={baseWorkout()}
        activeDuration={null}
        onFinishClick={vi.fn()}
        onDeleteWorkout={onDelete}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Ще дії з тренуванням",
    });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
