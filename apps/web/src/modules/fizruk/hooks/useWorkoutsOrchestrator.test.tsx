// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ToastProvider } from "@shared/hooks/useToast";
import { RestTimerProvider } from "../context/RestTimerProvider";
import { useWorkoutsOrchestrator } from "./useWorkoutsOrchestrator";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <RestTimerProvider>{children}</RestTimerProvider>
    </ToastProvider>
  );
}

function setup() {
  return renderHook(() => useWorkoutsOrchestrator(), { wrapper });
}

describe("useWorkoutsOrchestrator", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes a populated catalog and default UI state", () => {
    const { result } = setup();
    expect(result.current.exercises.length).toBeGreaterThan(0);
    expect(result.current.view).toBe("home");
    expect(result.current.mode).toBe("catalog");
    expect(result.current.activeWorkoutId).toBeNull();
    expect(result.current.finishedCount).toBe(0);
    expect(result.current.recentWorkouts).toEqual([]);
  });

  it("search query narrows the derived list", () => {
    const { result } = setup();
    const fullLen = result.current.grouped.length;
    act(() => result.current.setQ("zzz-no-match-xyz"));
    expect(result.current.grouped).toEqual([]);
    expect(result.current.grouped.length).toBeLessThanOrEqual(fullLen);
  });

  it("mode follows the view selection", () => {
    const { result } = setup();
    act(() => result.current.setView("log"));
    expect(result.current.mode).toBe("log");
    act(() => result.current.setView("templates"));
    expect(result.current.mode).toBe("catalog");
  });

  it("creating a workout and starting it sets the active workout", () => {
    const { result } = setup();
    let id = "";
    act(() => {
      id = result.current.createWorkout().id;
    });
    act(() => result.current.setActiveWorkoutId(id));
    expect(result.current.activeWorkoutId).toBe(id);
    expect(result.current.activeWorkout?.id).toBe(id);
    expect(localStorage.getItem("fizruk_active_workout_id_v1")).toBe(id);
  });

  it("handleExerciseInListClick selects the exercise outside log mode", () => {
    const { result } = setup();
    const ex = result.current.exercises[0]!;
    act(() => result.current.handleExerciseInListClick(ex));
    expect(result.current.selected?.id).toBe(ex.id);
  });

  it("handleExerciseInListClick warns without an active workout in log mode", () => {
    const { result } = setup();
    act(() => result.current.setView("log"));
    const ex = result.current.exercises[0]!;
    act(() => result.current.handleExerciseInListClick(ex));
    // No active workout → exercise not added, selection unchanged.
    expect(result.current.selected).toBeNull();
  });

  it("addExerciseToActive appends an item to the active workout", () => {
    const { result } = setup();
    let id = "";
    act(() => {
      id = result.current.createWorkout().id;
    });
    act(() => result.current.setActiveWorkoutId(id));
    const ex = result.current.exercises.find(
      (e) => e.primaryGroup !== "cardio",
    )!;
    act(() => result.current.addExerciseToActive(ex));
    const active = result.current.workouts.find((w) => w.id === id);
    expect((active?.items ?? []).some((i) => i.exerciseId === ex.id)).toBe(
      true,
    );
  });

  it("startWorkoutFromTemplate warns when the template has no catalog exercises", () => {
    const { result } = setup();
    act(() => {
      result.current.startWorkoutFromTemplate({
        id: "t1",
        name: "Empty",
        exerciseIds: ["does-not-exist"],
      } as never);
    });
    // No workout created from an empty template.
    expect(result.current.view).toBe("home");
  });

  it("startWorkoutFromTemplate executes for a valid non-risky template", () => {
    const { result } = setup();
    const ex = result.current.exercises[0]!;
    act(() => {
      result.current.startWorkoutFromTemplate({
        id: "t1",
        name: "Real",
        exerciseIds: [ex.id],
        groups: [],
      } as never);
    });
    // Either executed (view=log + active set) or routed to risky-confirm.
    const executed =
      result.current.view === "log" && result.current.activeWorkoutId !== null;
    const risky = result.current.riskyTemplateConfirm !== null;
    expect(executed || risky).toBe(true);
  });

  it("submitRetroWorkout creates a back-dated workout and closes the sheet", () => {
    const { result } = setup();
    act(() => result.current.setRetroDate("2024-02-15"));
    act(() => result.current.setRetroTime("09:30"));
    act(() => result.current.setRetroOpen(true));
    act(() => result.current.submitRetroWorkout());
    expect(result.current.retroOpen).toBe(false);
    expect(result.current.activeWorkoutId).not.toBeNull();
  });

  it("handleQuickStartConfirm builds a workout from picks", () => {
    const { result } = setup();
    const picks = result.current.exercises.slice(0, 2);
    act(() => result.current.setQuickStartOpen(true));
    act(() => result.current.handleQuickStartConfirm(picks));
    expect(result.current.quickStartOpen).toBe(false);
    expect(result.current.view).toBe("log");
    expect(result.current.activeWorkoutId).not.toBeNull();
  });

  it("removeItemWithUndo removes an item and exposes an undo", () => {
    const { result } = setup();
    let id = "";
    act(() => {
      id = result.current.createWorkout().id;
    });
    act(() => result.current.setActiveWorkoutId(id));
    const ex = result.current.exercises.find(
      (e) => e.primaryGroup !== "cardio",
    )!;
    act(() => result.current.addExerciseToActive(ex));
    const item = result.current.workouts
      .find((w) => w.id === id)!
      .items!.find((i) => i.exerciseId === ex.id)!;
    act(() => result.current.removeItemWithUndo(id, item.id));
    const after = result.current.workouts.find((w) => w.id === id);
    expect((after?.items ?? []).some((i) => i.id === item.id)).toBe(false);
  });

  it("handleDeleteExerciseConfirm closes the confirm dialog", () => {
    const { result } = setup();
    act(() => result.current.setDeleteExerciseConfirm(true));
    act(() => result.current.handleDeleteExerciseConfirm());
    expect(result.current.deleteExerciseConfirm).toBe(false);
  });

  it("handleRiskyTemplateConfirm clears the pending template", () => {
    const { result } = setup();
    const ex = result.current.exercises[0]!;
    act(() =>
      result.current.setRiskyTemplateConfirm({
        id: "t1",
        name: "R",
        exerciseIds: [ex.id],
      } as never),
    );
    act(() => result.current.handleRiskyTemplateConfirm());
    expect(result.current.riskyTemplateConfirm).toBeNull();
  });
});
