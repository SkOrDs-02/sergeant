// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useFizrukSqliteReadTick,
  notifyFizrukSqliteCacheRefresh,
  __openFizrukSqliteMutationWindow,
  __closeFizrukSqliteMutationWindow,
  __resetFizrukSqliteReadGateForTests,
} from "./sqliteReadGate";

vi.mock("@shared/lib/modules/hubBus", () => ({
  emitHubBus: vi.fn(),
}));

import { emitHubBus } from "@shared/lib/modules/hubBus";

beforeEach(() => {
  __resetFizrukSqliteReadGateForTests();
  vi.mocked(emitHubBus).mockClear();
});

describe("sqliteReadGate", () => {
  it("useFizrukSqliteReadTick re-renders on notify", () => {
    const { result } = renderHook(() => useFizrukSqliteReadTick());
    expect(result.current).toBe(0);

    act(() => notifyFizrukSqliteCacheRefresh());
    expect(result.current).toBe(1);
  });

  it("defers notify while mutation window is open", () => {
    const { result } = renderHook(() => useFizrukSqliteReadTick());

    act(() => __openFizrukSqliteMutationWindow());
    act(() => notifyFizrukSqliteCacheRefresh());
    expect(result.current).toBe(0);

    act(() => __closeFizrukSqliteMutationWindow());
    act(() => notifyFizrukSqliteCacheRefresh());
    expect(result.current).toBe(1);
  });

  it("emits hub bus on successful notify", () => {
    notifyFizrukSqliteCacheRefresh();
    expect(emitHubBus).toHaveBeenCalledWith("storageUpdated", undefined);
  });
});
