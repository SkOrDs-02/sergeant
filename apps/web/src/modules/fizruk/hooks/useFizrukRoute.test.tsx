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
});
