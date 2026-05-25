/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useLocale } from "./useLocale";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  // Reset URL between tests so query-param leak doesn't bleed.
  window.history.replaceState({}, "", "/");
});

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
});

/**
 * Contract tests for `useLocale`. Lock the resolution priority chain
 * (URL > localStorage > default) and the persist-on-set behavior so future
 * Stripe-redirect / marketing-link flows don't drift the contract.
 */
describe("useLocale", () => {
  it("defaults to 'uk' with no URL param and no localStorage", () => {
    const { result } = renderHook(() => useLocale());
    expect(result.current.locale).toBe("uk");
    // Sanity: messages object resolves
    expect(result.current.messages.auth).toBeDefined();
  });

  it("reads ?lang=en from URL on initial render", () => {
    window.history.replaceState({}, "", "/?lang=en");
    const { result } = renderHook(() => useLocale());
    expect(result.current.locale).toBe("en");
    const paywall = result.current.messages.paywall as Record<
      string,
      Record<string, string>
    >;
    expect(paywall["ai-photo-analysis"]?.["title"]).toBe(
      "AI photo analysis — Premium",
    );
  });

  it("reads localStorage when URL has no ?lang=", () => {
    window.localStorage.setItem("sergeant:locale", "en");
    const { result } = renderHook(() => useLocale());
    expect(result.current.locale).toBe("en");
  });

  it("URL param wins over localStorage when both are present", () => {
    window.localStorage.setItem("sergeant:locale", "uk");
    window.history.replaceState({}, "", "/?lang=en");
    const { result } = renderHook(() => useLocale());
    expect(result.current.locale).toBe("en");
  });

  it("setLocale persists to localStorage", () => {
    const { result } = renderHook(() => useLocale());
    act(() => result.current.setLocale("en"));
    expect(result.current.locale).toBe("en");
    expect(window.localStorage.getItem("sergeant:locale")).toBe("en");
  });

  it("setLocale strips ?lang= from URL when present", () => {
    window.history.replaceState({}, "", "/pricing?lang=en&source=paywall");
    const { result } = renderHook(() => useLocale());
    act(() => result.current.setLocale("uk"));
    // ?lang= gone; other params preserved
    expect(window.location.search).toBe("?source=paywall");
    expect(window.localStorage.getItem("sergeant:locale")).toBe("uk");
  });

  it("ignores unsupported locale in URL and falls back to default", () => {
    window.history.replaceState({}, "", "/?lang=fr");
    const { result } = renderHook(() => useLocale());
    expect(result.current.locale).toBe("uk");
  });

  it("accepts BCP-47 prefix (en-US → en)", () => {
    window.history.replaceState({}, "", "/?lang=en-US");
    const { result } = renderHook(() => useLocale());
    expect(result.current.locale).toBe("en");
  });
});
