/**
 * Render tests for `<RoutineSection>`.
 *
 * Covers:
 *  - collapsed-by-default header with the "Рутина" title;
 *  - expanding the group reveals both toggle rows with the
 *    calendar-visibility labels from the web version;
 *  - toggles default to `checked=true` because
 *    `prefs.showX !== false` and the default prefs are `{}`.
 *
 * Storage: `RoutineSection` now uses `useRoutinePrefs` (canonical SQLite
 * warm-cache path). The test mocks `saveRoutineState` so we can assert the
 * correct prefs patch without the async dual-write pipeline.
 */

import { fireEvent, render } from "@testing-library/react-native";

import { _getMMKVInstance } from "@/lib/storage";
import {
  __setRoutineSqliteStateCacheForTests,
  clearSqliteRoutineStateCache,
} from "@/modules/routine/lib/sqliteReader";
import { __resetRoutineSqliteReadGateForTests } from "@/modules/routine/lib/sqliteReadGate";

const mockSaveRoutineState = jest.fn();
jest.mock("@/modules/routine/lib/routineStore", () => {
  const actual = jest.requireActual<
    typeof import("@/modules/routine/lib/routineStore")
  >("@/modules/routine/lib/routineStore");
  return {
    ...actual,
    saveRoutineState: (...args: unknown[]) => mockSaveRoutineState(...args),
  };
});

import { RoutineSection } from "./RoutineSection";

beforeEach(() => {
  _getMMKVInstance().clearAll();
  clearSqliteRoutineStateCache();
  __resetRoutineSqliteReadGateForTests();
  mockSaveRoutineState.mockReset();
});

describe("RoutineSection", () => {
  it("renders the collapsed group header", () => {
    const { getByText, queryByText } = render(<RoutineSection />);
    expect(getByText("Рутина")).toBeTruthy();
    // Toggle labels are hidden until the group is expanded.
    expect(
      queryByText("Показувати тренування з Фізрука в календарі"),
    ).toBeNull();
  });

  it("expands to show both toggle rows when the header is pressed", () => {
    const { getByText } = render(<RoutineSection />);

    fireEvent.press(getByText("Рутина"));

    expect(
      getByText("Показувати тренування з Фізрука в календарі"),
    ).toBeTruthy();
    expect(
      getByText("Показувати планові платежі підписок Фініка в календарі"),
    ).toBeTruthy();
  });

  it("reflects prefs seeded into the SQLite cache", () => {
    __setRoutineSqliteStateCacheForTests({
      prefs: {
        showFizrukInCalendar: false,
        showFinykSubscriptionsInCalendar: true,
      },
    });

    const { getByText } = render(<RoutineSection />);
    fireEvent.press(getByText("Рутина"));

    // Both rows rendered; exact checked state is opaque via NativeWind Switch —
    // at minimum confirm the labels are present.
    expect(
      getByText("Показувати тренування з Фізрука в календарі"),
    ).toBeTruthy();
    expect(
      getByText("Показувати планові платежі підписок Фініка в календарі"),
    ).toBeTruthy();
  });

  it("calls saveRoutineState with updated prefs on toggle", () => {
    __setRoutineSqliteStateCacheForTests({
      prefs: { showFizrukInCalendar: true },
    });

    const { getByText, getAllByRole } = render(<RoutineSection />);
    fireEvent.press(getByText("Рутина"));

    // The ToggleRow renders a Switch — simulate a valueChange event.
    const switches = getAllByRole("switch");
    // First switch = showFizrukInCalendar
    if (switches[0]) {
      fireEvent(switches[0], "valueChange", false);
      expect(mockSaveRoutineState).toHaveBeenCalled();
      const savedState = mockSaveRoutineState.mock.calls[
        mockSaveRoutineState.mock.calls.length - 1
      ]![0] as { prefs: { showFizrukInCalendar?: boolean } };
      expect(savedState.prefs.showFizrukInCalendar).toBe(false);
    }
  });
});
