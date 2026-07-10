// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorageState } from "./useLocalStorageState";

describe("useLocalStorageState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value when the key is missing from storage", () => {
    const { result } = renderHook(() =>
      useLocalStorageState<number>("ls:missing", 42),
    );
    expect(result.current[0]).toBe(42);
  });

  it("reads the stored value synchronously on first render", () => {
    localStorage.setItem("ls:seed", JSON.stringify({ n: 7 }));
    const { result } = renderHook(() =>
      useLocalStorageState<{ n: number }>("ls:seed", { n: 0 }),
    );
    expect(result.current[0]).toEqual({ n: 7 });
  });

  it("writes updates back to storage", () => {
    const { result } = renderHook(() =>
      useLocalStorageState<string>("ls:write", "a"),
    );
    act(() => {
      result.current[1]("b");
    });
    expect(result.current[0]).toBe("b");
    expect(localStorage.getItem("ls:write")).toBe(JSON.stringify("b"));
  });

  it("supports updater functions like useState", () => {
    const { result } = renderHook(() =>
      useLocalStorageState<number>("ls:updater", 1),
    );
    act(() => {
      result.current[1]((prev) => prev + 10);
    });
    expect(result.current[0]).toBe(11);
    expect(localStorage.getItem("ls:updater")).toBe(JSON.stringify(11));
  });

  it("falls back to initial when the stored value fails validation", () => {
    localStorage.setItem("ls:validate", JSON.stringify({ bogus: true }));
    const isNumber = (x: unknown): x is number => typeof x === "number";
    const { result } = renderHook(() =>
      useLocalStorageState<number>("ls:validate", 5, { validate: isNumber }),
    );
    expect(result.current[0]).toBe(5);
  });

  it("falls back to initial on malformed JSON", () => {
    localStorage.setItem("ls:bad", "{not json");
    const { result } = renderHook(() =>
      useLocalStorageState<string>("ls:bad", "safe"),
    );
    expect(result.current[0]).toBe("safe");
  });

  it("accepts a lazy initial (evaluated once)", () => {
    const init = vi.fn(() => ({ count: 3 }));
    const { rerender } = renderHook(() =>
      useLocalStorageState<{ count: number }>("ls:lazy", init),
    );
    rerender();
    rerender();
    expect(init).toHaveBeenCalledTimes(1);
  });

  it("debounces writes when `debounceMs` is set", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useLocalStorageState<number>("ls:debounce", 0, { debounceMs: 300 }),
    );
    // Mount does not write (initial value is a seed, not a user write).
    expect(localStorage.getItem("ls:debounce")).toBeNull();

    act(() => {
      result.current[1](1);
    });
    // Value is in-memory immediately, but not yet flushed.
    expect(result.current[0]).toBe(1);
    expect(localStorage.getItem("ls:debounce")).toBeNull();

    act(() => {
      result.current[1](2);
    });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    // Still not committed (debounce reset by the second write).
    expect(localStorage.getItem("ls:debounce")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(localStorage.getItem("ls:debounce")).toBe(JSON.stringify(2));
  });

  it("re-reads storage when the key changes", () => {
    localStorage.setItem("ls:a", JSON.stringify("A"));
    localStorage.setItem("ls:b", JSON.stringify("B"));
    const { result, rerender } = renderHook(
      ({ k }) => useLocalStorageState<string>(k, "fallback"),
      { initialProps: { k: "ls:a" } },
    );
    expect(result.current[0]).toBe("A");
    rerender({ k: "ls:b" });
    expect(result.current[0]).toBe("B");
  });

  it("stores raw strings without JSON-encoding when `raw: true`", () => {
    localStorage.setItem("ls:raw", "calendar");
    const { result } = renderHook(() =>
      useLocalStorageState<"calendar" | "stats">("ls:raw", "calendar", {
        raw: true,
        validate: (v): v is "calendar" | "stats" =>
          v === "calendar" || v === "stats",
      }),
    );
    // Reads the bare string (not `"\"calendar\""`).
    expect(result.current[0]).toBe("calendar");

    act(() => {
      result.current[1]("stats");
    });
    // Write is also bare — preserves backwards compatibility with
    // legacy keys that were never JSON-encoded.
    expect(localStorage.getItem("ls:raw")).toBe("stats");
  });

  it("supports custom serializer / deserializer", () => {
    const serialize = (v: Date) => v.toISOString();
    const deserialize = (raw: string) => new Date(raw);
    const { result } = renderHook(() =>
      useLocalStorageState<Date>("ls:date", new Date("2024-01-01T00:00:00Z"), {
        serialize,
        deserialize,
      }),
    );
    act(() => {
      result.current[1](new Date("2025-06-15T10:20:30Z"));
    });
    expect(localStorage.getItem("ls:date")).toBe("2025-06-15T10:20:30.000Z");
  });
});
