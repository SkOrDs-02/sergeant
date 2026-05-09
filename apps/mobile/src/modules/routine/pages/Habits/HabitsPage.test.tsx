/**
 * Jest render + behaviour tests for `HabitsPage` (Phase 5 PR 3).
 *
 * Covers:
 *  - Empty state renders when there are no active habits;
 *  - Tapping "+ Додати" opens the `HabitForm` sheet in new-habit mode;
 *  - Existing habits render with their emoji + name in the active list;
 *  - Submitting the form from empty state creates a habit that
 *    appears in the list after the sheet closes.
 *
 * Persistence flows through `useRoutineStore`. Stage 8 PR
 * #057r-tombstone-mobile retired the MMKV write path — the hook now
 * reads from the SQLite warm cache and `saveRoutineState` updates that
 * cache (write-through) plus the dual-write pipeline. Tests seed /
 * inspect state via the cache helpers; MMKV is still cleared to keep
 * unrelated keys (e.g. tab-persistence) clean.
 */

import { AccessibilityInfo } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { _getMMKVInstance } from "@/lib/storage";
import { ToastProvider } from "@/components/ui/Toast";
import {
  clearSqliteCompletionsCache,
  clearSqliteRoutineStateCache,
} from "../../lib/sqliteReader";
import { __resetRoutineSqliteReadGateForTests } from "../../lib/sqliteReadGate";

import { HabitsPage } from "./HabitsPage";

function renderPage() {
  return render(
    <ToastProvider>
      <HabitsPage testID="habits-page" />
    </ToastProvider>,
  );
}

beforeEach(() => {
  _getMMKVInstance().clearAll();
  clearSqliteCompletionsCache();
  clearSqliteRoutineStateCache();
  __resetRoutineSqliteReadGateForTests();
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

describe("HabitsPage", () => {
  it("renders the empty state when no active habits exist", () => {
    renderPage();

    expect(screen.getByText("Активні звички")).toBeTruthy();
    expect(screen.getByText("Поки порожньо")).toBeTruthy();
    // FAB is always visible.
    expect(screen.getByTestId("habits-page-add")).toBeTruthy();
  });

  it("opens the HabitForm sheet when the FAB is pressed", () => {
    renderPage();

    // Before the press, no form headline is mounted.
    expect(screen.queryByText("Нова звичка")).toBeNull();

    fireEvent.press(screen.getByTestId("habits-page-add"));

    expect(screen.getByText("Нова звичка")).toBeTruthy();
    // Name input is available inside the sheet.
    expect(screen.getByLabelText("Назва звички")).toBeTruthy();
  });

  it("creates a habit via the form and renders it in the active list", () => {
    renderPage();

    fireEvent.press(screen.getByTestId("habits-page-add"));

    fireEvent.changeText(screen.getByLabelText("Назва звички"), "Пити воду");

    act(() => {
      fireEvent.press(screen.getByText("Додати"));
    });

    // Form has closed (headline is gone) and the new habit appears in
    // the active list. The emoji defaults to "✓".
    expect(screen.queryByText("Нова звичка")).toBeNull();
    expect(screen.getByText("✓ Пити воду")).toBeTruthy();
    // Empty state is no longer rendered.
    expect(screen.queryByText("Поки порожньо")).toBeNull();
  });
});
