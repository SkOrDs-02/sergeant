// @vitest-environment jsdom
/**
 * Last validated: 2026-06-15
 * Status: Active
 *
 * Hook test (T-7) for `useRestSettings` — fizruk's local-first rest-duration
 * store. Asserts: defaults are seeded from `REST_DEFAULTS`, an override
 * persists to `STORAGE_KEYS.FIZRUK_REST_SETTINGS` and survives a remount,
 * `getDefaultForGroup` routes a muscle group through `getRestCategory`, and a
 * stored override merges on top of defaults at read time.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { STORAGE_KEYS } from "@sergeant/shared";
import { REST_DEFAULTS } from "@sergeant/fizruk-domain";
import { useRestSettings } from "./useRestSettings";

const KEY = STORAGE_KEYS.FIZRUK_REST_SETTINGS;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("useRestSettings", () => {
  it("seeds from REST_DEFAULTS when storage is empty", () => {
    const { result } = renderHook(() => useRestSettings());
    expect(result.current.settings.compound).toBe(REST_DEFAULTS.compound);
    expect(result.current.settings.isolation).toBe(REST_DEFAULTS.isolation);
    expect(result.current.settings.cardio).toBe(REST_DEFAULTS.cardio);
  });

  it("persists an override to localStorage", () => {
    const { result } = renderHook(() => useRestSettings());

    act(() => {
      result.current.updateSetting("compound", 120);
    });

    expect(result.current.settings.compound).toBe(120);
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    expect(stored.compound).toBe(120);
  });

  it("rehydrates a persisted override on remount", () => {
    const first = renderHook(() => useRestSettings());
    act(() => {
      first.result.current.updateSetting("cardio", 45);
    });
    first.unmount();

    const second = renderHook(() => useRestSettings());
    expect(second.result.current.settings.cardio).toBe(45);
    // untouched categories still fall back to defaults
    expect(second.result.current.settings.compound).toBe(
      REST_DEFAULTS.compound,
    );
  });

  it("getDefaultForGroup routes a muscle group through its rest category", () => {
    const { result } = renderHook(() => useRestSettings());

    act(() => {
      result.current.updateSetting("isolation", 75);
    });

    // "biceps" classifies as isolation → picks up the override
    expect(result.current.getDefaultForGroup("biceps")).toBe(75);
    // "chest" is compound → still the default
    expect(result.current.getDefaultForGroup("chest")).toBe(
      REST_DEFAULTS.compound,
    );
  });
});
