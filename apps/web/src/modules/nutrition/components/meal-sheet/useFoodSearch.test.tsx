// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the meal-sheet `useFoodSearch` hook (debounced local +
 * OpenFoodFacts search via React Query).
 */
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const searchFoodsMock = vi.fn();
vi.mock("../../lib/foodDb/foodDb", () => ({
  searchFoods: (...a: unknown[]) => searchFoodsMock(...a),
}));

const offSearchMock = vi.fn();
vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    foodSearchApi: { search: (...a: unknown[]) => offSearchMock(...a) },
  };
});

import { useFoodSearch } from "./useFoodSearch";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  searchFoodsMock.mockReset();
  offSearchMock.mockReset();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useFoodSearch", () => {
  it("returns empty hits for a blank query", () => {
    const { result } = renderHook(() => useFoodSearch(""), {
      wrapper: makeWrapper(),
    });
    expect(result.current.foodHits).toEqual([]);
    expect(result.current.offHits).toEqual([]);
    expect(result.current.foodBusy).toBe(false);
    expect(result.current.offBusy).toBe(false);
  });

  it("runs the local search after the local debounce window", async () => {
    searchFoodsMock.mockResolvedValue([{ id: "f1", name: "Сир" }]);
    offSearchMock.mockResolvedValue({ products: [] });

    renderHook(() => useFoodSearch("сир"), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      vi.advanceTimersByTime(200); // > LOCAL_DEBOUNCE_MS (180)
      await Promise.resolve();
    });

    await vi.waitFor(
      () => {
        expect(searchFoodsMock).toHaveBeenCalledWith("сир", 8);
      },
      { interval: 10 },
    );
  });

  it("queries OpenFoodFacts after the OFF debounce window", async () => {
    searchFoodsMock.mockResolvedValue([]);
    offSearchMock.mockResolvedValue({
      products: [{ name: "Молоко" }],
    });

    renderHook(() => useFoodSearch("молоко"), { wrapper: makeWrapper() });

    await act(async () => {
      vi.advanceTimersByTime(650); // > OFF_DEBOUNCE_MS (600)
      await Promise.resolve();
    });

    await vi.waitFor(
      () => {
        expect(offSearchMock).toHaveBeenCalled();
      },
      { interval: 10 },
    );
  });

  it("exposes foodErr setter and clears it when the query changes", () => {
    const { result, rerender } = renderHook(({ q }) => useFoodSearch(q), {
      wrapper: makeWrapper(),
      initialProps: { q: "a" },
    });
    act(() => result.current.setFoodErr("Помилка збереження"));
    expect(result.current.foodErr).toBe("Помилка збереження");
    // Changing the trimmed query clears the stale save-error.
    rerender({ q: "ab" });
    expect(result.current.foodErr).toBe("");
  });
});
