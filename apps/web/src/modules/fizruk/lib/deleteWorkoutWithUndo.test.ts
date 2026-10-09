// @vitest-environment jsdom
/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToastApi } from "@shared/hooks/useToast";
import type { Workout } from "@sergeant/fizruk-domain";
import { deleteWorkoutWithUndo } from "./deleteWorkoutWithUndo";

const workout: Workout = {
  id: "w1",
  startedAt: "2026-09-29T18:00:00.000Z",
  endedAt: "2026-09-29T19:00:00.000Z",
  items: [],
  groups: [],
  warmup: null,
  cooldown: null,
  note: "",
};

function makeToast() {
  const captured: { action?: { onClick: () => void } } = {};
  const api: ToastApi = {
    show: vi.fn((_msg, _type, _duration, action) => {
      if (action) captured.action = action;
      return 1;
    }),
    success: vi.fn(() => 1),
    error: vi.fn(() => 2),
    info: vi.fn(() => 1),
    warning: vi.fn(() => 1),
    dismiss: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  };
  return { api, captured };
}

describe("deleteWorkoutWithUndo", () => {
  beforeEach(() => {
    navigator.vibrate = vi.fn();
  });

  it("видаляє тренування і показує undo-тост із текстом видалення", () => {
    const { api, captured } = makeToast();
    const deleteWorkout = vi.fn();
    const restoreWorkout = vi.fn();

    deleteWorkoutWithUndo({
      toast: api,
      workout,
      deleteWorkout,
      restoreWorkout,
    });

    expect(deleteWorkout).toHaveBeenCalledWith("w1");
    expect(api.show).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.show).mock.calls[0]?.[0]).toBe("Тренування видалено");
    expect(captured.action).toBeDefined();
    expect(restoreWorkout).not.toHaveBeenCalled();
  });

  it("onUndo відновлює знімок тренування", () => {
    const { api, captured } = makeToast();
    const deleteWorkout = vi.fn();
    const restoreWorkout = vi.fn();

    deleteWorkoutWithUndo({
      toast: api,
      workout,
      deleteWorkout,
      restoreWorkout,
    });
    captured.action?.onClick();

    expect(restoreWorkout).toHaveBeenCalledTimes(1);
    expect(restoreWorkout).toHaveBeenCalledWith(workout);
  });
});
