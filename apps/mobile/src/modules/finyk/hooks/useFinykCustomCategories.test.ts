/**
 * Focused tests for the `useFinykCustomCategories` hook.
 *
 * Verifies:
 *  - When the SQLite cache is cold, returns an empty list.
 *  - When the cache has entries, returns them on mount.
 *  - `setCustomCategories` calls `triggerFinykDualWrite` with the correct
 *    prev/next pair (dual-write teardown — no MMKV write).
 *  - Re-renders when the SQLite tick advances (cache refresh signal).
 */

import { act, renderHook } from "@testing-library/react-native";

import {
  clearFinykSqliteCache,
  getCachedFinykSqliteState,
} from "@/modules/finyk/lib/sqliteReader";
import {
  __resetFinykSqliteReadGateForTests,
  notifyFinykSqliteCacheRefresh,
} from "@/modules/finyk/lib/sqliteReadGate";
import { _getMMKVInstance } from "@/lib/storage";

const mockTriggerFinykDualWrite = jest.fn();
jest.mock("@/modules/finyk/lib/sqliteWriter", () => ({
  __esModule: true,
  triggerFinykDualWrite: (...args: unknown[]) =>
    mockTriggerFinykDualWrite(...args),
  isFinykDualWriteRegistered: () => false,
}));

import { useFinykCustomCategories } from "./useFinykCustomCategories";

beforeEach(() => {
  _getMMKVInstance().clearAll();
  clearFinykSqliteCache();
  __resetFinykSqliteReadGateForTests();
  mockTriggerFinykDualWrite.mockReset();
});

describe("useFinykCustomCategories", () => {
  it("returns empty list when SQLite cache is cold", () => {
    const { result } = renderHook(() => useFinykCustomCategories());
    expect(result.current.customCategories).toEqual([]);
  });

  it("returns categories seeded in the cache", () => {
    const live = getCachedFinykSqliteState() as {
      customCategories: Array<{ id: string; label: string }>;
      refreshedAt: string | null;
    };
    live.customCategories = [{ id: "c_1", label: "🎨 Хобі" }];
    live.refreshedAt = new Date().toISOString();

    const { result } = renderHook(() => useFinykCustomCategories());
    expect(result.current.customCategories).toEqual([
      { id: "c_1", label: "🎨 Хобі" },
    ]);
  });

  it("fires triggerFinykDualWrite with correct prev/next on add", () => {
    const { result } = renderHook(() => useFinykCustomCategories());

    act(() => {
      result.current.setCustomCategories((prev) => [
        ...prev,
        { id: "c_2", label: "📚 Книги" },
      ]);
    });

    expect(mockTriggerFinykDualWrite).toHaveBeenCalledTimes(1);
    const [prevState, nextState] = mockTriggerFinykDualWrite.mock.calls[0] as [
      { customCategories: Array<{ id: string; dataJson: string }> },
      { customCategories: Array<{ id: string; dataJson: string }> },
    ];
    expect(prevState.customCategories).toHaveLength(0);
    expect(nextState.customCategories).toHaveLength(1);
    const parsed = JSON.parse(nextState.customCategories[0]!.dataJson) as {
      id: string;
      label: string;
    };
    expect(parsed.label).toBe("📚 Книги");
  });

  it("re-renders with updated cache after notifyFinykSqliteCacheRefresh", () => {
    const { result } = renderHook(() => useFinykCustomCategories());
    expect(result.current.customCategories).toHaveLength(0);

    act(() => {
      const live = getCachedFinykSqliteState() as {
        customCategories: Array<{ id: string; label: string }>;
        refreshedAt: string | null;
      };
      live.customCategories = [{ id: "c_3", label: "🚀 Проект" }];
      live.refreshedAt = new Date().toISOString();
      notifyFinykSqliteCacheRefresh();
    });

    expect(result.current.customCategories).toEqual([
      { id: "c_3", label: "🚀 Проект" },
    ]);
  });

  it("does not write to MMKV finyk_custom_cats_v1", () => {
    const { result } = renderHook(() => useFinykCustomCategories());

    act(() => {
      result.current.setCustomCategories(() => [{ id: "c_4", label: "Test" }]);
    });

    expect(_getMMKVInstance().getString("finyk_custom_cats_v1")).toBeFalsy();
  });
});
