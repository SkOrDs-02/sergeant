/**
 * Focused tests for the `useRoutinePrefs` hook.
 *
 * Verifies:
 *  - Returns empty prefs when the SQLite cache is cold.
 *  - Returns prefs seeded into the cache on mount.
 *  - `updatePrefs` calls `saveRoutineState` with the patched prefs.
 *  - Re-renders when the SQLite tick advances (cache refresh signal).
 *  - Does NOT write to the legacy `@routine_prefs_v1` MMKV key.
 */

import { act, renderHook } from "@testing-library/react-native";

import {
  __setRoutineSqliteStateCacheForTests,
  clearSqliteRoutineStateCache,
} from "@/modules/routine/lib/sqliteReader";
import {
  __resetRoutineSqliteReadGateForTests,
  notifyRoutineSqliteCacheRefresh,
} from "@/modules/routine/lib/sqliteReadGate";
import { _getMMKVInstance } from "@/lib/storage";

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

import { useRoutinePrefs } from "./useRoutinePrefs";

beforeEach(() => {
  _getMMKVInstance().clearAll();
  clearSqliteRoutineStateCache();
  __resetRoutineSqliteReadGateForTests();
  mockSaveRoutineState.mockReset();
});

describe("useRoutinePrefs", () => {
  it("returns default prefs when cache is cold", () => {
    const { result } = renderHook(() => useRoutinePrefs());
    // Cold cache → loadRoutineState() falls back to defaultRoutineState().prefs.
    expect(result.current.prefs).toMatchObject({
      showFizrukInCalendar: true,
      showFinykSubscriptionsInCalendar: true,
      routineRemindersEnabled: false,
    });
  });

  it("returns prefs seeded in the SQLite cache", () => {
    __setRoutineSqliteStateCacheForTests({
      prefs: { showFizrukInCalendar: false, routineRemindersEnabled: true },
    });

    const { result } = renderHook(() => useRoutinePrefs());
    expect(result.current.prefs).toMatchObject({
      showFizrukInCalendar: false,
      routineRemindersEnabled: true,
    });
  });

  it("calls saveRoutineState with merged prefs on updatePrefs", () => {
    __setRoutineSqliteStateCacheForTests({
      prefs: { showFizrukInCalendar: true },
    });

    const { result } = renderHook(() => useRoutinePrefs());

    act(() => {
      result.current.updatePrefs({ routineRemindersEnabled: true });
    });

    expect(mockSaveRoutineState).toHaveBeenCalledTimes(1);
    const savedState = mockSaveRoutineState.mock.calls[0]![0] as {
      prefs: {
        showFizrukInCalendar?: boolean;
        routineRemindersEnabled?: boolean;
      };
    };
    expect(savedState.prefs.showFizrukInCalendar).toBe(true);
    expect(savedState.prefs.routineRemindersEnabled).toBe(true);
  });

  it("does NOT write to the legacy @routine_prefs_v1 MMKV key", () => {
    const { result } = renderHook(() => useRoutinePrefs());

    act(() => {
      result.current.updatePrefs({ routineRemindersEnabled: false });
    });

    expect(_getMMKVInstance().getString("@routine_prefs_v1")).toBeFalsy();
  });

  it("re-renders with updated prefs after notifyRoutineSqliteCacheRefresh", () => {
    const { result } = renderHook(() => useRoutinePrefs());
    // Cold cache: default prefs (not empty).
    expect(result.current.prefs).toMatchObject({ showFizrukInCalendar: true });

    act(() => {
      __setRoutineSqliteStateCacheForTests({
        prefs: { showFinykSubscriptionsInCalendar: false },
      });
      notifyRoutineSqliteCacheRefresh();
    });

    expect(result.current.prefs).toMatchObject({
      showFinykSubscriptionsInCalendar: false,
    });
  });
});
