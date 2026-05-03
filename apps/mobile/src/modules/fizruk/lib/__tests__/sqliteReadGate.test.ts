/**
 * Tests for the mobile Fizruk SQLite read gate (PR #029a).
 *
 * Mirrors the web vitest suite at
 * `apps/web/src/modules/fizruk/lib/sqliteReadGate.test.ts`. The gate
 * is platform-agnostic React state — only the `useFlag` import is
 * platform-specific, so we mock it to a constant boolean per case.
 */
import { act, renderHook } from "@testing-library/react-native";

const mockUseFlag = jest.fn<boolean, [string]>();

jest.mock("@/core/lib/featureFlags", () => ({
  useFlag: (id: string) => mockUseFlag(id),
}));

import {
  notifyFizrukSqliteCacheRefresh,
  useFizrukSqliteReadGate,
  useFizrukSqliteReadFlag,
  useFizrukSqliteReadTick,
  __resetFizrukSqliteReadGateForTests,
} from "../sqliteReadGate";

beforeEach(() => {
  __resetFizrukSqliteReadGateForTests();
  mockUseFlag.mockReset();
});

describe("useFizrukSqliteReadFlag", () => {
  it("reads the flag id from the registry via useFlag", () => {
    mockUseFlag.mockReturnValue(true);
    const { result } = renderHook(() => useFizrukSqliteReadFlag());
    expect(result.current).toBe(true);
    expect(mockUseFlag).toHaveBeenCalledWith(
      "feature.fizruk.sqlite_v2.read_sqlite",
    );
  });

  it("returns false when the registry returns false", () => {
    mockUseFlag.mockReturnValue(false);
    const { result } = renderHook(() => useFizrukSqliteReadFlag());
    expect(result.current).toBe(false);
  });
});

describe("useFizrukSqliteReadTick + notifyFizrukSqliteCacheRefresh", () => {
  it("starts at zero", () => {
    mockUseFlag.mockReturnValue(false);
    const { result } = renderHook(() => useFizrukSqliteReadTick());
    expect(result.current).toBe(0);
  });

  it("bumps the tick on every notify call", () => {
    mockUseFlag.mockReturnValue(false);
    const { result } = renderHook(() => useFizrukSqliteReadTick());
    expect(result.current).toBe(0);

    act(() => {
      notifyFizrukSqliteCacheRefresh();
    });
    expect(result.current).toBe(1);

    act(() => {
      notifyFizrukSqliteCacheRefresh();
      notifyFizrukSqliteCacheRefresh();
    });
    expect(result.current).toBe(3);
  });

  it("notifies multiple subscribers on every refresh", () => {
    mockUseFlag.mockReturnValue(false);
    const a = renderHook(() => useFizrukSqliteReadTick());
    const b = renderHook(() => useFizrukSqliteReadTick());

    act(() => {
      notifyFizrukSqliteCacheRefresh();
    });
    expect(a.result.current).toBe(1);
    expect(b.result.current).toBe(1);
  });

  it("does not notify subscribers that have unmounted", () => {
    mockUseFlag.mockReturnValue(false);
    const { result, unmount } = renderHook(() => useFizrukSqliteReadTick());
    unmount();

    // No throw, no observable update on the unmounted result.
    expect(() =>
      act(() => {
        notifyFizrukSqliteCacheRefresh();
      }),
    ).not.toThrow();
    expect(result.current).toBe(0);
  });
});

describe("useFizrukSqliteReadGate (combined)", () => {
  it("returns the flag value + the current tick", () => {
    mockUseFlag.mockReturnValue(true);
    const { result } = renderHook(() => useFizrukSqliteReadGate());
    expect(result.current).toEqual({ enabled: true, tick: 0 });
  });

  it("rerenders with the bumped tick after notify", () => {
    mockUseFlag.mockReturnValue(true);
    const { result } = renderHook(() => useFizrukSqliteReadGate());
    expect(result.current.tick).toBe(0);

    act(() => {
      notifyFizrukSqliteCacheRefresh();
    });
    expect(result.current).toEqual({ enabled: true, tick: 1 });
  });
});
