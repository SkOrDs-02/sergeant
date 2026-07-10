/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { STORAGE_KEYS } from "@sergeant/shared";

const storage = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLSValidated: vi.fn(
    (key: string, _schema: unknown, fallback: unknown) => {
      return storage.has(key) ? storage.get(key) : fallback;
    },
  ),
  safeWriteLS: vi.fn((key: string, value: unknown) => {
    storage.set(key, value);
  }),
}));

import { safeWriteLS } from "@shared/lib/storage/storage";
import { useHubPref } from "./hubPrefs";

describe("useHubPref", () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it("returns the persisted value when the key exists", () => {
    storage.set(STORAGE_KEYS.HUB_PREFS, { showHints: false });
    const { result } = renderHook(() => useHubPref("showHints", true));
    expect(result.current[0]).toBe(false);
  });

  it("falls back to the default when the key is absent", () => {
    const { result } = renderHook(() => useHubPref("adaptiveBento", true));
    expect(result.current[0]).toBe(true);
  });

  it("writes through to hub prefs and reacts to storage events", async () => {
    const { result } = renderHook(() => useHubPref("showTodayFocus", true));

    act(() => {
      result.current[1](false);
    });

    expect(result.current[0]).toBe(false);
    expect(safeWriteLS).toHaveBeenCalledWith(STORAGE_KEYS.HUB_PREFS, {
      showTodayFocus: false,
    });

    act(() => {
      storage.set(STORAGE_KEYS.HUB_PREFS, { showTodayFocus: true });
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEYS.HUB_PREFS }),
      );
    });

    await waitFor(() => {
      expect(result.current[0]).toBe(true);
    });
  });
});
