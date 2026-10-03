// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@shared/lib";
import { flushPendingWrites } from "../lib/finykStorage";
import {
  matchesShape,
  reportSilentError,
  usePersist,
  useReadonlyPersist,
} from "./useStorage.persist";

afterEach(() => {
  flushPendingWrites();
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("matchesShape", () => {
  it("accepts values that match the default collection shape", () => {
    expect(matchesShape(["tx"], [])).toBe(true);
    expect(matchesShape({ byId: {} }, {})).toBe(true);
    expect(matchesShape("scalar", "")).toBe(true);
  });

  it("rejects array/object shape mismatches", () => {
    expect(matchesShape({ 0: "tx" }, [])).toBe(false);
    expect(matchesShape([], {})).toBe(false);
    expect(matchesShape(null, {})).toBe(false);
  });
});

describe("usePersist", () => {
  it("reads an existing value and writes updates through the debounced storage layer", () => {
    vi.useFakeTimers();
    localStorage.setItem("finyk_test_slot", JSON.stringify(["stored"]));

    const { result } = renderHook(() =>
      usePersist<string[]>("finyk_test_slot", []),
    );

    expect(result.current[0]).toEqual(["stored"]);

    act(() => {
      result.current[1](["next"]);
    });
    vi.runOnlyPendingTimers();

    expect(JSON.parse(localStorage.getItem("finyk_test_slot")!)).toEqual([
      "next",
    ]);
  });

  it("falls back to default value and reports shape mismatches", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    localStorage.setItem("finyk_bad_slot", JSON.stringify(["not-object"]));

    const { result } = renderHook(() => usePersist("finyk_bad_slot", {}));

    expect(result.current[0]).toEqual({});
    expect(warn).toHaveBeenCalledWith(
      '[finyk] usePersist shape mismatch ("finyk_bad_slot")',
      ["not-object"],
    );
  });
});

describe("useReadonlyPersist", () => {
  it("updates React state without writing back to localStorage", () => {
    vi.useFakeTimers();
    localStorage.setItem("finyk_readonly_slot", JSON.stringify(["stored"]));

    const { result } = renderHook(() =>
      useReadonlyPersist<string[]>("finyk_readonly_slot", []),
    );

    act(() => {
      result.current[1](["memory-only"]);
    });
    vi.runOnlyPendingTimers();

    expect(result.current[0]).toEqual(["memory-only"]);
    expect(JSON.parse(localStorage.getItem("finyk_readonly_slot")!)).toEqual([
      "stored",
    ]);
  });

  it("exposes reportSilentError as the shared logger warning format", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    reportSilentError("test-scope", { reason: "bad-shape" });

    expect(warn).toHaveBeenCalledWith("[finyk] test-scope", {
      reason: "bad-shape",
    });
  });
});
