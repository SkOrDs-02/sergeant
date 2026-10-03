// @vitest-environment jsdom
/**
 * Tests for `useInsightDismissal` — localStorage-backed "dismissed until the
 * end of today" tracking with cross-tab storage-event sync.
 *
 * Рішення власника 2026-10-01: «✕» ховає картку до кінця ПОТОЧНОЇ особистої
 * доби (годинник пристрою, ADR-0078), а не назавжди. Формат сховища —
 * `{ [id]: ts }`; старий масив id без міток часу вважається простроченим.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act as rtlAct } from "@testing-library/react";
import { useInsightDismissal } from "./useInsightDismissal";

const DISMISSED_KEY = "sergeant.v2.insights.dismissed";

// Локальні компоненти: межа доби — годинник пристрою, не UTC.
const NOON = new Date(2026, 9, 1, 12, 0, 0);
const TOMORROW_EARLY = new Date(2026, 9, 2, 0, 0, 5);

function stored(): Record<string, number> {
  return JSON.parse(localStorage.getItem(DISMISSED_KEY)!);
}

describe("useInsightDismissal", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(NOON);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with no dismissals", () => {
    const { result } = renderHook(() => useInsightDismissal());
    expect(result.current.isDismissed("finyk-coffee")).toBe(false);
  });

  it("dismiss(id) persists the id with a timestamp and marks it dismissed", () => {
    const { result } = renderHook(() => useInsightDismissal());
    rtlAct(() => result.current.dismiss("finyk-coffee"));
    expect(result.current.isDismissed("finyk-coffee")).toBe(true);
    expect(stored()).toEqual({ "finyk-coffee": NOON.getTime() });
  });

  it("dismiss is idempotent for the same id within a day", () => {
    const { result } = renderHook(() => useInsightDismissal());
    rtlAct(() => result.current.dismiss("x"));
    vi.setSystemTime(new Date(2026, 9, 1, 15, 0, 0));
    rtlAct(() => result.current.dismiss("x"));
    // Другий ✕ у ту саму добу не пересуває мітку.
    expect(stored()).toEqual({ x: NOON.getTime() });
  });

  it("hydrates today's dismissals from existing localStorage data", () => {
    localStorage.setItem(
      DISMISSED_KEY,
      JSON.stringify({ "routine-streak": NOON.getTime() - 3_600_000 }),
    );
    const { result } = renderHook(() => useInsightDismissal());
    expect(result.current.isDismissed("routine-streak")).toBe(true);
  });

  it("the dismissal expires at the personal-day boundary: «✕» is not forever", () => {
    const { result } = renderHook(() => useInsightDismissal());
    rtlAct(() => result.current.dismiss("finyk-coffee"));
    expect(result.current.isDismissed("finyk-coffee")).toBe(true);

    // Північ за годинником пристрою — застосунок відкритий, перезавантаження немає.
    vi.setSystemTime(TOMORROW_EARLY);
    expect(result.current.isDismissed("finyk-coffee")).toBe(false);
  });

  it("an entry from yesterday does not hide the card on a fresh mount", () => {
    localStorage.setItem(
      DISMISSED_KEY,
      JSON.stringify({ old: new Date(2026, 8, 30, 23, 0, 0).getTime() }),
    );
    const { result } = renderHook(() => useInsightDismissal());
    expect(result.current.isDismissed("old")).toBe(false);
  });

  it("legacy permanent dismissals (array of ids, no timestamps) count as expired", () => {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(["routine-streak"]));
    const { result } = renderHook(() => useInsightDismissal());
    expect(result.current.isDismissed("routine-streak")).toBe(false);
  });

  it("legacy entries without a real timestamp inside the new shape are expired too", () => {
    localStorage.setItem(
      DISMISSED_KEY,
      JSON.stringify({ a: true, b: 1, c: "yesterday" }),
    );
    const { result } = renderHook(() => useInsightDismissal());
    for (const id of ["a", "b", "c"]) {
      expect(result.current.isDismissed(id)).toBe(false);
    }
  });

  it("a new dismissal drops the legacy array / expired entries from storage", () => {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(["legacy-id"]));
    const { result } = renderHook(() => useInsightDismissal());
    rtlAct(() => result.current.dismiss("fresh"));
    expect(stored()).toEqual({ fresh: NOON.getTime() });
  });

  it("restore(ids) un-hides today's dismissed ids and keeps the others", () => {
    const { result } = renderHook(() => useInsightDismissal());
    rtlAct(() => result.current.dismiss("a"));
    rtlAct(() => result.current.dismiss("b"));
    rtlAct(() => result.current.restore(["a"]));
    expect(result.current.isDismissed("a")).toBe(false);
    expect(result.current.isDismissed("b")).toBe(true);
    expect(stored()).toEqual({ b: NOON.getTime() });
  });

  it("clear() removes all dismissals", () => {
    const { result } = renderHook(() => useInsightDismissal());
    rtlAct(() => result.current.dismiss("a"));
    rtlAct(() => result.current.dismiss("b"));
    rtlAct(() => result.current.clear());
    expect(result.current.isDismissed("a")).toBe(false);
    expect(result.current.isDismissed("b")).toBe(false);
    expect(localStorage.getItem(DISMISSED_KEY)).toBe("{}");
  });

  it("syncs dismissal from another tab via a storage event", () => {
    const { result } = renderHook(() => useInsightDismissal());
    expect(result.current.isDismissed("from-tab-a")).toBe(false);
    rtlAct(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: DISMISSED_KEY,
          newValue: JSON.stringify({ "from-tab-a": NOON.getTime() }),
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
          newValue: JSON.stringify({ nope: NOON.getTime() }),
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
