// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for `useNutritionRoute` — URL-derived nutrition tab state.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
let currentPathname = "/nutrition";

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ pathname: currentPathname, search: "", hash: "" }),
}));

// `useBrowserLocation` just echoes the router location in tests — the
// snapshot-staleness logic is covered separately in core.
vi.mock("../../../core/hooks/useBrowserLocation", () => ({
  useBrowserLocation: (loc: { pathname: string }) => loc,
}));

import { useNutritionRoute } from "./useNutritionRoute";

beforeEach(() => {
  navigateMock.mockClear();
  currentPathname = "/nutrition";
  window.location.hash = "";
});

afterEach(() => {
  window.location.hash = "";
});

describe("useNutritionRoute derived state", () => {
  it("derives start from /nutrition", () => {
    currentPathname = "/nutrition";
    const { result } = renderHook(() => useNutritionRoute());
    expect(result.current.activePage).toBe("start");
    expect(result.current.pantrySubTab).toBe("items");
    expect(result.current.menuSubTab).toBe("plan");
  });

  it("derives the page from a path segment", () => {
    currentPathname = "/nutrition/log";
    const { result } = renderHook(() => useNutritionRoute());
    expect(result.current.activePage).toBe("log");
  });

  it("derives pantry sub-tab from /nutrition/pantry/shopping", () => {
    currentPathname = "/nutrition/pantry/shopping";
    const { result } = renderHook(() => useNutritionRoute());
    expect(result.current.activePage).toBe("pantry");
    expect(result.current.pantrySubTab).toBe("shopping");
  });

  it("derives menu sub-tab from /nutrition/menu/recipes", () => {
    currentPathname = "/nutrition/menu/recipes";
    const { result } = renderHook(() => useNutritionRoute());
    expect(result.current.menuSubTab).toBe("recipes");
  });

  it("treats a non-nutrition pathname as start", () => {
    currentPathname = "/finyk";
    const { result } = renderHook(() => useNutritionRoute());
    expect(result.current.activePage).toBe("start");
  });
});

describe("useNutritionRoute navigation", () => {
  it("setActivePageAndHash navigates to the page path", () => {
    currentPathname = "/nutrition";
    const { result } = renderHook(() => useNutritionRoute());
    result.current.setActivePageAndHash("log");
    expect(navigateMock).toHaveBeenCalledWith("/nutrition/log", {
      replace: false,
    });
  });

  it("setActivePage no-ops when already on the target path", () => {
    currentPathname = "/nutrition/log";
    const { result } = renderHook(() => useNutritionRoute());
    navigateMock.mockClear();
    result.current.setActivePage("log");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("setPantrySubTab navigates to the sub-tab path", () => {
    currentPathname = "/nutrition/pantry";
    const { result } = renderHook(() => useNutritionRoute());
    navigateMock.mockClear();
    result.current.setPantrySubTab("shopping");
    expect(navigateMock).toHaveBeenCalledWith("/nutrition/pantry/shopping", {
      replace: false,
    });
  });

  it("setMenuSubTab drops the sub-tab segment for the default plan sub-tab", () => {
    currentPathname = "/nutrition/menu/recipes";
    const { result } = renderHook(() => useNutritionRoute());
    navigateMock.mockClear();
    result.current.setMenuSubTab("plan");
    expect(navigateMock).toHaveBeenCalledWith("/nutrition/menu", {
      replace: false,
    });
  });

  it("rewrites a legacy hash URL once on mount", () => {
    currentPathname = "/nutrition";
    window.location.hash = "#log";
    renderHook(() => useNutritionRoute());
    expect(navigateMock).toHaveBeenCalledWith("/nutrition/log", {
      replace: true,
    });
  });
});

describe("useNutritionRoute same-path guard vs. a stale useBrowserLocation snapshot", () => {
  // `useBrowserLocation`'s frozen native-event snapshot can briefly disagree
  // with the just-committed React Router location (e.g. right after a real
  // browser-back, before RR7's startTransition-wrapped update lands). Before
  // this fix the same-path guard compared against that resolved-but-stale
  // value: if the stale snapshot happened to already equal the tap's target
  // path, the guard would no-op even though the live router was still on a
  // *different* page — the tap silently did nothing
  // ("сторінка не відкривається одразу" — page-audit nutrition-overview-01).
  it("still navigates when a stale resolved location coincidentally equals the tap target", async () => {
    vi.resetModules();
    vi.doMock("react-router-dom", () => ({
      useNavigate: () => navigateMock,
      // Live router: still on the start page.
      useLocation: () => ({ pathname: "/nutrition", search: "", hash: "" }),
    }));
    vi.doMock("../../../core/hooks/useBrowserLocation", () => ({
      // Stale snapshot claims we're already on the tap's target
      // ("/nutrition/log") — exactly the coincidence that swallowed the
      // real navigation under the old `location.pathname` guard.
      useBrowserLocation: () => ({
        pathname: "/nutrition/log",
        search: "",
        hash: "",
      }),
    }));
    const { useNutritionRoute: freshUseNutritionRoute } =
      await import("./useNutritionRoute");
    navigateMock.mockClear();
    const { result } = renderHook(() => freshUseNutritionRoute());
    result.current.setActivePageAndHash("log");
    expect(navigateMock).toHaveBeenCalledWith("/nutrition/log", {
      replace: false,
    });
    vi.doUnmock("react-router-dom");
    vi.doUnmock("../../../core/hooks/useBrowserLocation");
  });
});
