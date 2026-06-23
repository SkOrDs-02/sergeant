// @vitest-environment jsdom
/**
 * Tests for `useTheme` — 4-mode theme controller that owns the `dark`
 * and `hc` classes on `<html>` and persists the choice via the storage
 * wrapper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useTheme,
  THEME_CHOICE_LABELS,
  THEME_CHOICE_SHORT_LABELS,
  THEME_CHOICE_ICONS,
  THEME_CHOICES,
} from "./useTheme";

function setSystemDark(dark: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("dark") ? dark : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  );
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: globalThis.matchMedia,
  });
}

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    setSystemDark(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.className = "";
  });

  it("defaults to system when no stored choice", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.choice).toBe("system");
  });

  it("applies the dark class for an explicit dark choice", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setChoice("dark"));
    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("hc")).toBe(false);
  });

  it("removes the dark class for an explicit light choice", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setChoice("dark"));
    act(() => result.current.setChoice("light"));
    expect(result.current.isDark).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("layers the hc class additively over the system dark preference", () => {
    setSystemDark(true);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setChoice("hc"));
    expect(result.current.isHighContrast).toBe(true);
    expect(result.current.isDark).toBe(true); // follows system dark
    expect(document.documentElement.classList.contains("hc")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("system mode follows the prefers-color-scheme media query", () => {
    setSystemDark(true);
    const { result } = renderHook(() => useTheme());
    // initial readInitialChoice → system; resolved dark from media query
    expect(result.current.choice).toBe("system");
    expect(result.current.systemPrefersDark).toBe(true);
    expect(result.current.isDark).toBe(true);
  });

  it("persists the choice so a fresh mount reads it back", () => {
    const { result, unmount } = renderHook(() => useTheme());
    act(() => result.current.setChoice("dark"));
    unmount();
    const { result: result2 } = renderHook(() => useTheme());
    expect(result2.current.choice).toBe("dark");
  });

  it("migrates a legacy boolean dark key", () => {
    localStorage.setItem("hub_dark_mode_v1", "1");
    const { result } = renderHook(() => useTheme());
    expect(result.current.choice).toBe("dark");
  });

  it("migrates a legacy schedule:system key", () => {
    localStorage.setItem(
      "hub_dark_mode_schedule_v1",
      JSON.stringify({ mode: "system" }),
    );
    const { result } = renderHook(() => useTheme());
    expect(result.current.choice).toBe("system");
  });

  it("exposes consistent label / icon maps for all choices", () => {
    for (const choice of THEME_CHOICES) {
      expect(typeof THEME_CHOICE_LABELS[choice]).toBe("string");
      expect(typeof THEME_CHOICE_SHORT_LABELS[choice]).toBe("string");
      expect(THEME_CHOICE_ICONS[choice]).toBeTruthy();
    }
    expect(THEME_CHOICES).toContain("hc");
  });
});
