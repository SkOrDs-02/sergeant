// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMeasurements } from "./useMeasurements";

describe("useMeasurements", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts with no entries", () => {
    const { result } = renderHook(() => useMeasurements());
    expect(result.current.entries).toEqual([]);
  });

  it("addEntry stores valid fields and assigns id + timestamp", () => {
    const { result } = renderHook(() => useMeasurements());
    let created: { id: string } | undefined;
    act(() => {
      created = result.current.addEntry({ weightKg: 80, waistCm: 90 });
    });
    expect(created!.id).toMatch(/^m_/);
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]!.weightKg).toBe(80);
    expect(result.current.entries[0]!.waistCm).toBe(90);
  });

  it("strips out-of-range and non-finite values", () => {
    const { result } = renderHook(() => useMeasurements());
    act(() => {
      result.current.addEntry({
        weightKg: 5, // below min 20
        bodyFatPct: 50, // valid
        neckCm: NaN, // non-finite
      });
    });
    const e = result.current.entries[0]!;
    expect(e.weightKg).toBeUndefined();
    expect(e.bodyFatPct).toBe(50);
    expect(e.neckCm).toBeUndefined();
  });

  it("coerces numeric strings within range", () => {
    const { result } = renderHook(() => useMeasurements());
    act(() => {
      result.current.addEntry({ weightKg: "75" as never });
    });
    expect(result.current.entries[0]!.weightKg).toBe(75);
  });

  it("deleteEntry removes the targeted entry", () => {
    const { result } = renderHook(() => useMeasurements());
    let id = "";
    act(() => {
      id = result.current.addEntry({ weightKg: 80 }).id;
    });
    act(() => result.current.deleteEntry(id));
    expect(result.current.entries).toHaveLength(0);
  });

  it("restoreEntry re-inserts and is idempotent", () => {
    const { result } = renderHook(() => useMeasurements());
    const entry = { id: "m-1", at: "2024-01-01T00:00:00Z", weightKg: 80 };
    act(() => result.current.restoreEntry(entry));
    expect(result.current.entries).toHaveLength(1);
    act(() => result.current.restoreEntry(entry));
    expect(result.current.entries).toHaveLength(1);
  });

  it("restoreEntry ignores null / id-less input", () => {
    const { result } = renderHook(() => useMeasurements());
    act(() => result.current.restoreEntry(null));
    act(() => result.current.restoreEntry({ at: "x" } as never));
    expect(result.current.entries).toHaveLength(0);
  });

  it("sorts entries by `at` descending", () => {
    const { result } = renderHook(() => useMeasurements());
    act(() => {
      result.current.restoreEntry({ id: "a", at: "2024-01-01T00:00:00Z" });
    });
    act(() => {
      result.current.restoreEntry({ id: "b", at: "2024-03-01T00:00:00Z" });
    });
    expect(result.current.entries.map((e) => e.id)).toEqual(["b", "a"]);
  });
});
