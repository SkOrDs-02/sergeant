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

function setSystemMedia(dark: boolean, contrast = false): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-contrast")
        ? contrast
        : query.includes("dark")
          ? dark
          : false,
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

/** Mirrors the two `media`-scoped `<meta name="theme-color">` tags in
 *  `index.html` so `applyResolvedTheme` has something to overwrite. */
function addThemeColorMetas(): void {
  const light = document.createElement("meta");
  light.setAttribute("name", "theme-color");
  light.setAttribute("media", "(prefers-color-scheme: light)");
  light.setAttribute("content", "#f2ecdf");
  const dark = document.createElement("meta");
  dark.setAttribute("name", "theme-color");
  dark.setAttribute("media", "(prefers-color-scheme: dark)");
  dark.setAttribute("content", "#14100e");
  document.head.append(light, dark);
}

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    setSystemMedia(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.className = "";
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((meta) => meta.remove());
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
    setSystemMedia(true);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setChoice("hc"));
    expect(result.current.isHighContrast).toBe(true);
    expect(result.current.isDark).toBe(true); // follows system dark
    expect(document.documentElement.classList.contains("hc")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("system mode follows the prefers-color-scheme media query", () => {
    setSystemMedia(true);
    const { result } = renderHook(() => useTheme());
    // initial readInitialChoice → system; resolved dark from media query
    expect(result.current.choice).toBe("system");
    expect(result.current.systemPrefersDark).toBe(true);
    expect(result.current.isDark).toBe(true);
  });

  it("system mode turns on hc when the OS asks for more contrast", () => {
    setSystemMedia(false, true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.choice).toBe("system");
    expect(result.current.isHighContrast).toBe(true);
    expect(document.documentElement.classList.contains("hc")).toBe(true);
  });

  it("does not force hc over an explicit light choice", () => {
    setSystemMedia(false, true);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setChoice("light"));
    expect(result.current.isHighContrast).toBe(false);
    expect(document.documentElement.classList.contains("hc")).toBe(false);
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

  // C7 web-audit: `applyResolvedTheme` now keeps the OS status-bar /
  // title-bar (`<meta name="theme-color">`) in sync with the resolved
  // theme instead of leaving it pinned to whatever the static
  // `prefers-color-scheme` media matched at load.
  it("syncs meta[name=theme-color] to the resolved bg on choice change", () => {
    addThemeColorMetas();
    const { result } = renderHook(() => useTheme());
    const metas = () =>
      Array.from(
        document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
      ).map((m) => m.content);

    // Initial mount resolves to light (system, non-dark media stub).
    expect(metas()).toEqual(["#f2ecdf", "#f2ecdf"]);

    act(() => result.current.setChoice("dark"));
    expect(metas()).toEqual(["#14100e", "#14100e"]);

    act(() => result.current.setChoice("light"));
    expect(metas()).toEqual(["#f2ecdf", "#f2ecdf"]);
  });

  it("does not throw when no theme-color meta is present", () => {
    const { result } = renderHook(() => useTheme());
    expect(() => act(() => result.current.setChoice("dark"))).not.toThrow();
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
