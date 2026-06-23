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
