/**
 * Jest render + behaviour tests for `HabitForm` (Phase 5 PR 3).
 *
 * Covers the contract the domain package guarantees —
 *  - required-field validation blocks submit,
 *  - edit-mode pre-populates every field,
 *  - recurrence → `weekly` exposes the `WeekdayPicker`,
 *  - submitting forwards a fully-normalised `HabitDraftPatch`.
 *
 * UI affordances (emoji picker, advanced disclosure) are only exercised
 * enough to prove they render without crashing — the deep behaviour
 * (which emoji becomes selected, etc.) is covered by the domain tests
 * since all logic flows through `habitDraftToPatch` / `habitToDraft`.
 */

import { AccessibilityInfo } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

import type { Habit, RoutineState } from "@sergeant/routine-domain";
import { defaultRoutineState } from "@sergeant/routine-domain";

import { HabitForm } from "./HabitForm";

function makeRoutine(overrides?: Partial<RoutineState>): RoutineState {
  return {
    ...defaultRoutineState(),
    ...(overrides ?? {}),
  };
}

describe("HabitForm", () => {
  beforeEach(() => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, "addEventListener")
      .mockImplementation(() => ({ remove: () => {} }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not render when closed", () => {
    const onSubmit = jest.fn();
    render(
      <HabitForm
        open={false}
        onClose={jest.fn()}
        routine={makeRoutine()}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.queryByText("Нова звичка")).toBeNull();
  });

  it("blocks submission with an empty name and surfaces an inline error", () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();
    render(
      <HabitForm
        open
        onClose={onClose}
        routine={makeRoutine()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.press(screen.getByText("Додати"));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Додай назву звички.")).toBeTruthy();
  });

  it("submits the normalised patch and closes the sheet on save", () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();
    render(
      <HabitForm
        open
        onClose={onClose}
        routine={makeRoutine()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.changeText(
      screen.getByLabelText("Назва звички"),
      "  Пити воду  ",
    );
    fireEvent.press(screen.getByText("Додати"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const patch = onSubmit.mock.calls[0][0];
    // `habitDraftToPatch` is exercised here; the normalisation is
    // covered in full by the domain tests.
    expect(patch.name).toBe("Пити воду");
    expect(patch.emoji).toBe("check");
    expect(patch.recurrence).toBe("daily");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("exposes the weekday picker when recurrence flips to weekly", () => {
    render(
      <HabitForm
        open
        onClose={jest.fn()}
        routine={makeRoutine()}
        onSubmit={jest.fn()}
        testID="habit-form"
      />,
    );

    // The weekday picker only renders for weekly recurrence. Before
    // toggling, the weekday-0 chip should not be present.
    expect(screen.queryByTestId("habit-form-weekdays-day-0")).toBeNull();

    // Switch to weekly. We look up the recurrence chip by its test ID
    // (stable regardless of label copy).
    fireEvent.press(screen.getByTestId("habit-form-recurrence-weekly"));

    expect(screen.getByTestId("habit-form-weekdays-day-0")).toBeTruthy();
    expect(screen.getByTestId("habit-form-weekdays-day-6")).toBeTruthy();
  });

  it("populates every field when editing an existing habit", () => {
    const onSubmit = jest.fn();
    const editingHabit: Habit = {
      id: "h1",
      name: "Ранкова зарядка",
      emoji: "🏃",
      tagIds: [],
      categoryId: null,
      recurrence: "daily",
      startDate: "2026-01-01",
      endDate: "",
      timeOfDay: "08:00",
      reminderTimes: ["08:00"],
      weekdays: [1, 3, 5],
    };

    render(
      <HabitForm
        open
        onClose={jest.fn()}
        routine={makeRoutine()}
        editingHabit={editingHabit}
        onSubmit={onSubmit}
        testID="habit-form"
      />,
    );

    // Name input receives the pre-populated value.
    expect(screen.getByDisplayValue("Ранкова зарядка")).toBeTruthy();
    // Start date reuses the habit value.
    expect(screen.getByDisplayValue("2026-01-01")).toBeTruthy();

    fireEvent.press(screen.getByText("Зберегти"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const patch = onSubmit.mock.calls[0][0];
    expect(patch.name).toBe("Ранкова зарядка");
    // Легасі-emoji звички апгрейдиться до slug (`glyphs.ts`).
    expect(patch.emoji).toBe("run");
    expect(patch.reminderTimes).toEqual(["08:00"]);
  });
});
