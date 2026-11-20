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

// Засів бази продуктів (зйомка 2026-11-18: конструктор страви на свіжому
// пристрої шукав у порожній базі, бо засів кликав лише аркуш прийому).
const seedMock = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));
vi.mock("../../lib/foodDb/seedFoodsOnce", () => ({
  ensureSeedFoodsOnce: () => seedMock(),
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
  seedMock.mockReset();
  seedMock.mockImplementation(() => Promise.resolve(true));
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

  it("локальний пошук спершу чекає засіву бази продуктів", async () => {
    let finishSeed: (ok: boolean) => void = () => {};
    seedMock.mockImplementation(
      () => new Promise<boolean>((r) => (finishSeed = r)),
    );
    searchFoodsMock.mockResolvedValue([{ id: "gen_banana", name: "Банан" }]);
    offSearchMock.mockResolvedValue({ products: [] });

    const { result } = renderHook(() => useFoodSearch("банан"), {
      wrapper: makeWrapper(),
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(seedMock).toHaveBeenCalled(), {
      interval: 10,
    });
    expect(searchFoodsMock).not.toHaveBeenCalled();

    await act(async () => {
      finishSeed(true);
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(result.current.foodHits).toHaveLength(1), {
      interval: 10,
    });
    expect(searchFoodsMock).toHaveBeenCalledWith("банан", 8);
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

  // Регресія browser-QA 2026-09-02: `off.error` не читав ніхто, тож збій
  // пошуку показувався як «нічого не знайдено» — відповідь про порожню базу
  // замість відповіді про збій. Найтихіший випадок — завеликий запит: сервер
  // віддавав 400, а екран стверджував, що такого продукту не існує.
  it("повідомляє про збій пошуку, а не вдає порожній результат", async () => {
    searchFoodsMock.mockResolvedValue([]);
    offSearchMock.mockRejectedValue(new Error("400"));

    const { result } = renderHook(() => useFoodSearch("сир"), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    await vi.waitFor(
      () => {
        expect(result.current.foodErr).toContain("не відповів");
      },
      { timeout: 2000, interval: 10 },
    );
    expect(result.current.offHits).toEqual([]);
  });

  it("ручна помилка має пріоритет над збоєм пошуку", async () => {
    searchFoodsMock.mockResolvedValue([]);
    offSearchMock.mockRejectedValue(new Error("400"));

    const { result } = renderHook(() => useFoodSearch("сир"), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });
    await vi.waitFor(
      () => {
        expect(result.current.foodErr).toContain("не відповів");
      },
      { timeout: 2000, interval: 10 },
    );

    act(() => result.current.setFoodErr("Штрихкод не розпізнано."));
    expect(result.current.foodErr).toBe("Штрихкод не розпізнано.");
  });
});
