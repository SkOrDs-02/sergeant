/**
 * Tests for the mobile Fizruk SQLite read gate.
 *
 * Stage 8 PR #057f-flag: the `feature.fizruk.sqlite_v2.read_sqlite`
 * flag has graduated — gate now exposes only the pub-sub tick, so
 * these tests only cover {@link useFizrukSqliteReadTick} +
 * {@link notifyFizrukSqliteCacheRefresh}. The flag-related cases were
 * dropped together with the registry entry.
 */
import { act, renderHook } from "@testing-library/react-native";

import {
  notifyFizrukSqliteCacheRefresh,
  useFizrukSqliteReadTick,
  __resetFizrukSqliteReadGateForTests,
} from "../sqliteReadGate";

beforeEach(() => {
  __resetFizrukSqliteReadGateForTests();
});

describe("useFizrukSqliteReadTick + notifyFizrukSqliteCacheRefresh", () => {
  it("starts at zero", () => {
    const { result } = renderHook(() => useFizrukSqliteReadTick());
    expect(result.current).toBe(0);
  });

  it("bumps the tick on every notify call", () => {
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
    const a = renderHook(() => useFizrukSqliteReadTick());
    const b = renderHook(() => useFizrukSqliteReadTick());

    act(() => {
      notifyFizrukSqliteCacheRefresh();
    });
    expect(a.result.current).toBe(1);
    expect(b.result.current).toBe(1);
  });

  it("does not notify subscribers that have unmounted", () => {
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
