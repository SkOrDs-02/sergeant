/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRoutineRoute } from "./useRoutineRoute";

function wrapper(initialPath: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/routine/*" element={<>{children}</>} />
          <Route path="*" element={<>{children}</>} />
        </Routes>
      </MemoryRouter>
    );
  };
}

describe("useRoutineRoute", () => {
  beforeEach(() => {
    window.location.hash = "";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves the calendar page for the bare /routine path", () => {
    const { result } = renderHook(() => useRoutineRoute(), {
      wrapper: wrapper("/routine"),
    });
    expect(result.current.page).toBe("calendar");
  });

  it("resolves the stats page for /routine/stats", () => {
    const { result } = renderHook(() => useRoutineRoute(), {
      wrapper: wrapper("/routine/stats"),
    });
    expect(result.current.page).toBe("stats");
  });

  it("falls back to the default page outside /routine", () => {
    const { result } = renderHook(() => useRoutineRoute("stats"), {
      wrapper: wrapper("/elsewhere"),
    });
    expect(result.current.page).toBe("stats");
  });

  it("falls back to calendar for an unknown sub-path", () => {
    const { result } = renderHook(() => useRoutineRoute(), {
      wrapper: wrapper("/routine/bogus"),
    });
    expect(result.current.page).toBe("calendar");
  });

  it("navigate() pushes the target path", () => {
    const seen: string[] = [];
    function Probe() {
      const loc = useLocation();
      seen.push(loc.pathname);
      return useRoutineRoute();
    }
    const { result } = renderHook(() => Probe(), {
      wrapper: wrapper("/routine"),
    });
    act(() => {
      result.current.navigate("stats");
    });
    expect(seen.at(-1)).toBe("/routine/stats");
  });

  it("navigate() to the current page is a no-op", () => {
    const { result } = renderHook(() => useRoutineRoute(), {
      wrapper: wrapper("/routine/stats"),
    });
    // already on stats — navigating to stats must not throw / change page
    act(() => {
      result.current.navigate("stats");
    });
    expect(result.current.page).toBe("stats");
  });
});
