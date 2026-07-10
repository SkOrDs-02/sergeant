// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { defaultRoutineState } from "@sergeant/routine-domain";
import { RoutineActions } from "./RoutineActions";

vi.mock("./components/RoutineBottomNav", () => ({
  RoutineBottomNav: (p: {
    mainTab: string;
    onSelectTab: (tab: string) => void;
    onAddHabit: () => void;
  }) => (
    <div data-testid="routine-bottom-nav">
      <button onClick={() => p.onSelectTab("stats")}>switch-stats</button>
      <button onClick={p.onAddHabit}>add-habit</button>
      <span>{p.mainTab}</span>
    </div>
  ),
}));

vi.mock("./components/HabitQuickCreateDialog", () => ({
  HabitQuickCreateDialog: (p: { open: boolean; onClose: () => void }) =>
    p.open ? (
      <div data-testid="quick-add-dialog">
        <button onClick={p.onClose}>close-dialog</button>
      </div>
    ) : null,
}));

const baseProps = {
  mainTab: "calendar" as const,
  setMainTab: vi.fn(),
  routine: defaultRoutineState(),
  setRoutine: vi.fn(),
  quickAddHabitOpen: false,
  quickAddFocusTick: 0,
  quickAddFirstRunHint: false,
  onDismissQuickAddFirstRunHint: vi.fn(),
  onOpenQuickAddHabit: vi.fn(),
  onCloseQuickAddHabit: vi.fn(),
};

afterEach(cleanup);

describe("RoutineActions", () => {
  it("wires bottom nav tab switch and add-habit affordance", () => {
    const setMainTab = vi.fn();
    const onOpenQuickAddHabit = vi.fn();
    render(
      <RoutineActions
        {...baseProps}
        setMainTab={setMainTab}
        onOpenQuickAddHabit={onOpenQuickAddHabit}
      />,
    );
    fireEvent.click(screen.getByText("switch-stats"));
    expect(setMainTab).toHaveBeenCalledWith("stats");
    fireEvent.click(screen.getByText("add-habit"));
    expect(onOpenQuickAddHabit).toHaveBeenCalledOnce();
  });

  it("shows the quick-add dialog when open and closes via callback", () => {
    const onCloseQuickAddHabit = vi.fn();
    render(
      <RoutineActions
        {...baseProps}
        quickAddHabitOpen
        onCloseQuickAddHabit={onCloseQuickAddHabit}
      />,
    );
    expect(screen.getByTestId("quick-add-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByText("close-dialog"));
    expect(onCloseQuickAddHabit).toHaveBeenCalledOnce();
  });
});
