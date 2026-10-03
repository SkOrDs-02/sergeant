// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSqliteTickOverlay } from "./useSqliteTickOverlay";

describe("useSqliteTickOverlay", () => {
  it("returns the initial state on first render", () => {
    const { result } = renderHook(() =>
      useSqliteTickOverlay(0, () => "overlay", "initial"),
    );
    expect(result.current[0]).toBe("initial");
  });

  it("applies overlay state when tick advances", () => {
    const readOverlay = vi.fn(() => "from-cache");
    const { result, rerender } = renderHook(
      ({ tick }) => useSqliteTickOverlay(tick, readOverlay, "initial"),
      { initialProps: { tick: 0 } },
    );

    rerender({ tick: 1 });

    expect(readOverlay).toHaveBeenCalled();
    expect(result.current[0]).toBe("from-cache");
  });

  it("keeps existing state when overlay read returns undefined", () => {
    const readOverlay = vi.fn(() => undefined);
    const { result, rerender } = renderHook(
      ({ tick }) => useSqliteTickOverlay(tick, readOverlay, "initial"),
      { initialProps: { tick: 0 } },
    );

    act(() => {
      result.current[1]("manual");
    });
    rerender({ tick: 1 });

    expect(result.current[0]).toBe("manual");
  });

  it("still allows setState after an overlay is applied", () => {
    const readOverlay = vi.fn(() => "from-cache");
    const { result, rerender } = renderHook(
      ({ tick }) => useSqliteTickOverlay(tick, readOverlay, "initial"),
      { initialProps: { tick: 0 } },
    );

    rerender({ tick: 1 });
    expect(result.current[0]).toBe("from-cache");

    act(() => {
      result.current[1]("manual-after");
    });
    expect(result.current[0]).toBe("manual-after");
  });
});
