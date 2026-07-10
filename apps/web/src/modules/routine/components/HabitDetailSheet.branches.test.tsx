/** @vitest-environment jsdom */
/**
 * Branch coverage for HabitDetailSheet — delete without undo snapshot and
 * bounded date-range labels.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import { defaultRoutineState } from "@sergeant/routine-domain";
import type { RoutineState } from "../lib/types";

const {
  deleteHabitMock,
  restoreHabitMock,
  snapshotHabitMock,
  showUndoToastMock,
} = vi.hoisted(() => ({
  deleteHabitMock: vi.fn(),
  restoreHabitMock: vi.fn(),
  snapshotHabitMock: vi.fn(),
  showUndoToastMock: vi.fn(),
}));

vi.mock("../lib/routineStorage", () => ({
  deleteHabit: deleteHabitMock,
  restoreHabit: restoreHabitMock,
  snapshotHabit: snapshotHabitMock,
}));

vi.mock("@shared/lib/ui/undoToast", () => ({
  showUndoToast: showUndoToastMock,
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));

vi.mock("./HabitQuickCreateDialog", () => ({
  HabitQuickCreateDialog: () => null,
}));

import { HabitDetailSheet } from "./HabitDetailSheet";

const FIXED_NOW = new Date("2026-06-16T09:00:00Z");

function makeRoutine(over: Partial<RoutineState> = {}): RoutineState {
  return {
    ...defaultRoutineState(),
    habits: [
      {
        id: "h1",
        name: "Тест",
        recurrence: "daily",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
    ],
    completions: { h1: [] },
    ...over,
  };
}

describe("HabitDetailSheet (branches)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    deleteHabitMock.mockReset().mockImplementation((s: RoutineState) => s);
    restoreHabitMock.mockReset().mockImplementation((s: RoutineState) => s);
    snapshotHabitMock.mockReset().mockReturnValue(null);
    showUndoToastMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("closes after delete without showing undo when snapshot is null", () => {
    const onClose = vi.fn();
    const setRoutine = vi.fn(
      (value: RoutineState | ((s: RoutineState) => RoutineState)) => {
        if (typeof value === "function") value(makeRoutine());
      },
    );
    render(
      <HabitDetailSheet
        habitId="h1"
        routine={makeRoutine()}
        onClose={onClose}
        setRoutine={setRoutine}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^видалити$/i }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: /^видалити$/i }),
    );

    expect(deleteHabitMock).toHaveBeenCalledWith(expect.anything(), "h1");
    expect(showUndoToastMock).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders a bounded start/end date label", () => {
    render(
      <HabitDetailSheet
        habitId="h1"
        routine={makeRoutine()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/з 2026-01-01 до 2026-12-31/)).toBeInTheDocument();
  });

  it("renders only a start-date prefix when endDate is absent", () => {
    const routine = makeRoutine({
      habits: [
        {
          id: "h1",
          name: "Тест",
          recurrence: "daily",
          startDate: "2026-03-01",
        },
      ],
    });
    render(
      <HabitDetailSheet habitId="h1" routine={routine} onClose={vi.fn()} />,
    );
    expect(screen.getByText("з 2026-03-01")).toBeInTheDocument();
  });
});
