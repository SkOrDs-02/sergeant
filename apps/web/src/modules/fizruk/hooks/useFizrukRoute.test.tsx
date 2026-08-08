/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFizrukRoute } from "./useFizrukRoute";

function wrapper(initialPath: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/fizruk/*" element={<>{children}</>} />
          <Route path="*" element={<>{children}</>} />
        </Routes>
      </MemoryRouter>
    );
  };
}

describe("useFizrukRoute", () => {
  beforeEach(() => {
    window.location.hash = "";
    // Defect #1 (source-aware exercise-page back navigation) persists a
    // "where did the user come from" pointer in `sessionStorage` — clear it
    // between tests so one test's navigation history can't leak into the
    // next.
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves dashboard for the bare /fizruk path", () => {
    const { result } = renderHook(() => useFizrukRoute(), {
      wrapper: wrapper("/fizruk"),
    });
    expect(result.current.page).toBe("dashboard");
    expect(result.current.segments).toEqual([]);
  });

  it("resolves a named page", () => {
    const { result } = renderHook(() => useFizrukRoute(), {
      wrapper: wrapper("/fizruk/workouts"),
    });
    expect(result.current.page).toBe("workouts");
  });

  it("parses an exercise tail segment", () => {
    const { result } = renderHook(() => useFizrukRoute(), {
      wrapper: wrapper("/fizruk/exercise/abc-123"),
    });
    expect(result.current.page).toBe("exercise");
    expect(result.current.segments).toEqual(["abc-123"]);
  });

  it("parses an active workout tail segment", () => {
    const { result } = renderHook(() => useFizrukRoute(), {
      wrapper: wrapper("/fizruk/workout/w-123"),
    });
    expect(result.current.page).toBe("workout");
    expect(result.current.segments).toEqual(["w-123"]);
  });

  it("falls back to the default page outside /fizruk", () => {
    const { result } = renderHook(() => useFizrukRoute("progress"), {
      wrapper: wrapper("/elsewhere"),
    });
    expect(result.current.page).toBe("progress");
  });

  it("falls back to dashboard for an unknown sub-path", () => {
    const { result } = renderHook(() => useFizrukRoute(), {
      wrapper: wrapper("/fizruk/bogus"),
    });
    expect(result.current.page).toBe("dashboard");
  });

  it("navigate() pushes the target path", () => {
    const seen: string[] = [];
    function Probe() {
      const loc = useLocation();
      seen.push(loc.pathname);
      return useFizrukRoute();
    }
    const { result } = renderHook(() => Probe(), {
      wrapper: wrapper("/fizruk"),
    });
    act(() => {
      result.current.navigate("workouts");
    });
    expect(seen.at(-1)).toBe("/fizruk/workouts");
  });

  it("navigate() reaches the dedicated history route", () => {
    const seen: string[] = [];
    function Probe() {
      const loc = useLocation();
      seen.push(loc.pathname);
      return useFizrukRoute();
    }
    const { result } = renderHook(() => Probe(), {
      wrapper: wrapper("/fizruk/workouts"),
    });
    act(() => {
      result.current.navigate("history");
    });
    expect(seen.at(-1)).toBe("/fizruk/history");
    expect(result.current.page).toBe("history");
  });

  it("navigate() accepts a page/segment string", () => {
    const seen: string[] = [];
    function Probe() {
      const loc = useLocation();
      seen.push(loc.pathname);
      return useFizrukRoute();
    }
    const { result } = renderHook(() => Probe(), {
      wrapper: wrapper("/fizruk"),
    });
    act(() => {
      result.current.navigate("exercise/xyz");
    });
    expect(seen.at(-1)).toBe("/fizruk/exercise/xyz");
  });

  it("navigate() to the current page is a no-op", () => {
    const { result } = renderHook(() => useFizrukRoute(), {
      wrapper: wrapper("/fizruk/workouts"),
    });
    act(() => {
      result.current.navigate("workouts");
    });
    expect(result.current.page).toBe("workouts");
  });

  it("redirects a legacy hash URL to the path equivalent", () => {
    const seen: string[] = [];
    window.location.hash = "#workouts";
    function Probe() {
      const loc = useLocation();
      seen.push(loc.pathname);
      return useFizrukRoute();
    }
    renderHook(() => Probe(), { wrapper: wrapper("/fizruk") });
    expect(seen.at(-1)).toBe("/fizruk/workouts");
  });

  describe("defect #1 — source-aware exercise-page back navigation", () => {
    it("navigate('workouts') from the exercise page returns to Progress when that was the source", () => {
      const seen: string[] = [];
      function Probe() {
        const loc = useLocation();
        seen.push(loc.pathname);
        return useFizrukRoute();
      }
      const { result } = renderHook(() => Probe(), {
        wrapper: wrapper("/fizruk/progress"),
      });
      act(() => {
        result.current.navigate("exercise/bench_press_barbell");
      });
      expect(seen.at(-1)).toBe("/fizruk/exercise/bench_press_barbell");

      // The header's contextual back arrow (and the in-page "До журналу" /
      // "Перейти до журналу" CTAs) all call `navigate("workouts")` — the
      // page should return to Progress, not the hardcoded journal.
      act(() => {
        result.current.navigate("workouts");
      });
      expect(seen.at(-1)).toBe("/fizruk/progress");
    });

    it("navigate('workouts') from the exercise page returns to an active workout session when that was the source", () => {
      const seen: string[] = [];
      function Probe() {
        const loc = useLocation();
        seen.push(loc.pathname);
        return useFizrukRoute();
      }
      const { result } = renderHook(() => Probe(), {
        wrapper: wrapper("/fizruk/workout/w-42"),
      });
      act(() => {
        result.current.navigate("exercise/bench_press_barbell");
      });
      expect(seen.at(-1)).toBe("/fizruk/exercise/bench_press_barbell");

      act(() => {
        result.current.navigate("workouts");
      });
      expect(seen.at(-1)).toBe("/fizruk/workout/w-42");
    });

    it("navigate('workouts') from the exercise page falls back to the journal for a fresh deep-link (no recorded source)", () => {
      const seen: string[] = [];
      function Probe() {
        const loc = useLocation();
        seen.push(loc.pathname);
        return useFizrukRoute();
      }
      const { result } = renderHook(() => Probe(), {
        wrapper: wrapper("/fizruk/exercise/bench_press_barbell"),
      });
      act(() => {
        result.current.navigate("workouts");
      });
      expect(seen.at(-1)).toBe("/fizruk/workouts");
    });

    it("navigate('exercise/<id>') while already on the exercise page is unaffected (segment present)", () => {
      const seen: string[] = [];
      function Probe() {
        const loc = useLocation();
        seen.push(loc.pathname);
        return useFizrukRoute();
      }
      const { result } = renderHook(() => Probe(), {
        wrapper: wrapper("/fizruk/exercise/bench_press_barbell"),
      });
      act(() => {
        result.current.navigate("exercise/deadlift_barbell");
      });
      expect(seen.at(-1)).toBe("/fizruk/exercise/deadlift_barbell");
    });
  });
});
