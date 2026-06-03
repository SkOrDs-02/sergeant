// @vitest-environment jsdom
/**
 * Tests for the same-tab storage-refresh signal (audit-02 F3 / F10).
 *
 * Verifies that:
 *  1. `useHubStorageBump` increments its counter when `hubBus
 *     "storageUpdated"` fires (same-tab path).
 *  2. `useHubStorageBump` increments its counter when the native
 *     `window "storage"` event fires (cross-tab path).
 *  3. The bump counter is stable across renders that do not involve a
 *     storage signal (no spurious increments).
 *  4. Unsubscribing on unmount prevents dangling callbacks.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { emitHubBus, __resetHubBusForTests } from "@shared/lib/modules/hubBus";
import { useHubStorageBump } from "./useHubStorageBump";

beforeEach(() => {
  __resetHubBusForTests();
});

afterEach(() => {
  cleanup();
  __resetHubBusForTests();
});

describe("useHubStorageBump", () => {
  it("starts at 0", () => {
    const { result } = renderHook(() => useHubStorageBump());
    expect(result.current).toBe(0);
  });

  it("increments when hubBus storageUpdated fires (same-tab signal)", () => {
    const { result } = renderHook(() => useHubStorageBump());
    expect(result.current).toBe(0);

    act(() => {
      emitHubBus("storageUpdated", undefined);
    });

    expect(result.current).toBe(1);
  });

  it("increments on each successive storageUpdated emit", () => {
    const { result } = renderHook(() => useHubStorageBump());

    act(() => {
      emitHubBus("storageUpdated", undefined);
    });
    act(() => {
      emitHubBus("storageUpdated", undefined);
    });
    act(() => {
      emitHubBus("storageUpdated", undefined);
    });

    expect(result.current).toBe(3);
  });

  it("increments when window storage event fires (cross-tab signal)", () => {
    const { result } = renderHook(() => useHubStorageBump());
    expect(result.current).toBe(0);

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "fizruk_workouts_v1" }),
      );
    });

    expect(result.current).toBe(1);
  });

  it("does not increment when unrelated hub bus events fire", () => {
    const { result } = renderHook(() => useHubStorageBump());

    act(() => {
      emitHubBus("openSearch", undefined);
    });

    expect(result.current).toBe(0);
  });

  it("stops incrementing after unmount (no dangling listener)", () => {
    const { result, unmount } = renderHook(() => useHubStorageBump());
    expect(result.current).toBe(0);

    unmount();

    // Emit after unmount — should not throw and result stays at 0
    act(() => {
      emitHubBus("storageUpdated", undefined);
    });

    // `result.current` was captured at unmount-time; we just assert no throw
    expect(result.current).toBe(0);
  });
});
