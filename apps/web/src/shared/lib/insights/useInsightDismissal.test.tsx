// @vitest-environment jsdom
/**
 * Tests for `useInsightDismissal` — localStorage-backed "already
 * dismissed" tracking with cross-tab storage-event sync.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act as rtlAct } from "@testing-library/react";
import { useInsightDismissal } from "./useInsightDismissal";

const DISMISSED_KEY = "sergeant.v2.insights.dismissed";

describe("useInsightDismissal", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts with no dismissals", () => {
    const { result } = renderHook(() => useInsightDismissal());
    expect(result.current.isDismissed("finyk-coffee")).toBe(false);
  });

  it("dismiss(id) persists and marks the insight dismissed", () => {
    const { result } = renderHook(() => useInsightDismissal());
    rtlAct(() => result.current.dismiss("finyk-coffee"));
    expect(result.current.isDismissed("finyk-coffee")).toBe(true);
    const stored = JSON.parse(localStorage.getItem(DISMISSED_KEY)!);
    expect(stored).toContain("finyk-coffee");
  });

  it("dismiss is idempotent for the same id", () => {
    const { result } = renderHook(() => useInsightDismissal());
    rtlAct(() => result.current.dismiss("x"));
    rtlAct(() => result.current.dismiss("x"));
    const stored = JSON.parse(localStorage.getItem(DISMISSED_KEY)!);
    expect(stored.filter((s: string) => s === "x")).toHaveLength(1);
  });

  it("hydrates initial state from existing localStorage data", () => {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(["routine-streak"]));
    const { result } = renderHook(() => useInsightDismissal());
    expect(result.current.isDismissed("routine-streak")).toBe(true);
  });

  it("clear() removes all dismissals", () => {
    const { result } = renderHook(() => useInsightDismissal());
    rtlAct(() => result.current.dismiss("a"));
    rtlAct(() => result.current.dismiss("b"));
    rtlAct(() => result.current.clear());
    expect(result.current.isDismissed("a")).toBe(false);
    expect(result.current.isDismissed("b")).toBe(false);
    expect(localStorage.getItem(DISMISSED_KEY)).toBe("[]");
  });

  it("syncs dismissal from another tab via a storage event", () => {
    const { result } = renderHook(() => useInsightDismissal());
    expect(result.current.isDismissed("from-tab-a")).toBe(false);
    rtlAct(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: DISMISSED_KEY,
          newValue: JSON.stringify(["from-tab-a"]),
        }),
      );
    });
    expect(result.current.isDismissed("from-tab-a")).toBe(true);
  });

  it("ignores storage events for unrelated keys", () => {
    const { result } = renderHook(() => useInsightDismissal());
    rtlAct(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "some-other-key",
          newValue: JSON.stringify(["nope"]),
        }),
      );
    });
    expect(result.current.isDismissed("nope")).toBe(false);
  });

  it("treats corrupt stored JSON as no dismissals", () => {
    localStorage.setItem(DISMISSED_KEY, "{not json");
    const { result } = renderHook(() => useInsightDismissal());
    expect(result.current.isDismissed("anything")).toBe(false);
  });
});
