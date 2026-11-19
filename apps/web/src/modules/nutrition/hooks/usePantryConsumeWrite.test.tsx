// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    nutritionApi: { parsePantry: vi.fn() },
  };
});

import { useNutritionPantries } from "./useNutritionPantries";
import type { PantryConsumeTicket } from "./usePantryConsumeWrite";
import type { Pantry } from "../lib/nutritionStorage";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../lib/sqliteReader";
import { notifyNutritionSqliteCacheRefresh } from "../lib/sqliteReadGate";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function seedPantries(items: any[]) {
  __setNutritionSqliteCacheForTests({
    pantries: [{ id: "home", name: "Дім", items, text: "" }],
    activePantryId: "home",
  });
  notifyNutritionSqliteCacheRefresh();
}

function renderHarness() {
  const { result } = renderHook(
    () =>
      useNutritionPantries({
        setBusy: vi.fn(),
        setErr: vi.fn(),
        setStatusText: vi.fn(),
        setDenial: vi.fn(),
      }),
    { wrapper: makeWrapper() },
  );
  return result;
}

function homeItems(result: { current: { pantries: Pantry[] } }) {
  return result.current.pantries.find((p) => p.id === "home")?.items ?? [];
}

describe("списання з квитанцією і його відкат (OD-27 Х-4 а)", () => {
  beforeEach(() => {
    localStorage.clear();
    clearNutritionSqliteCache();
    vi.clearAllMocks();
  });

  it("квитанція несе списане, відкат повертає позицію як була", () => {
    seedPantries([{ id: "r1", name: "Рис", qty: 500, unit: "г", notes: null }]);
    const result = renderHarness();
    let ticket: PantryConsumeTicket | null = null;
    act(() => {
      ticket = result.current.consumePantryItem("Рис", 150);
    });
    expect(homeItems(result)[0]).toMatchObject({ qty: 350 });
    expect(ticket!.receipt).toMatchObject({ deducted: 150, unit: "г" });

    let reverted = false;
    act(() => {
      reverted = result.current.revertConsume(ticket!.receipt!);
    });
    expect(reverted).toBe(true);
    expect(homeItems(result)[0]).toMatchObject({ id: "r1", qty: 500 });
  });

  it("вичерпану й зниклу позицію відкат повертає цілком", () => {
    seedPantries([{ id: "r1", name: "Рис", qty: 100, unit: "г", notes: null }]);
    const result = renderHarness();
    let ticket: PantryConsumeTicket | null = null;
    act(() => {
      ticket = result.current.consumePantryItem("Рис", 150);
    });
    expect(homeItems(result)).toHaveLength(0);
    act(() => {
      result.current.revertConsume(ticket!.receipt!);
    });
    expect(homeItems(result)).toEqual([
      expect.objectContaining({ id: "r1", qty: 100, unit: "г" }),
    ]);
  });

  it("позицію, змінену після списання, відкат доповнює на списане", () => {
    seedPantries([{ id: "r1", name: "Рис", qty: 500, unit: "г", notes: null }]);
    const result = renderHarness();
    let ticket: PantryConsumeTicket | null = null;
    act(() => {
      ticket = result.current.consumePantryItem("Рис", 150);
    });
    act(() => {
      result.current.consumePantryItem("Рис", 50);
    });
    expect(homeItems(result)[0]).toMatchObject({ qty: 300 });
    act(() => {
      result.current.revertConsume(ticket!.receipt!);
    });
    expect(homeItems(result)[0]).toMatchObject({ qty: 450 });
  });

  it("позицію, яку людина видалила сама, відкат не воскрешає", () => {
    seedPantries([{ id: "r1", name: "Рис", qty: 500, unit: "г", notes: null }]);
    const result = renderHarness();
    let ticket: PantryConsumeTicket | null = null;
    act(() => {
      ticket = result.current.consumePantryItem("Рис", 150);
    });
    act(() => {
      result.current.removeItem("Рис");
    });
    let reverted = true;
    act(() => {
      reverted = result.current.revertConsume(ticket!.receipt!);
    });
    expect(reverted).toBe(false);
    expect(homeItems(result)).toHaveLength(0);
  });

  it("скасований запис не списує після вибору варіанта", () => {
    seedPantries([
      {
        id: "m1",
        name: "Молоко",
        qty: 2000,
        unit: "мл",
        notes: null,
        sources: [
          { name: "Молоко 2.6%", qty: 1000, unit: "мл" },
          { name: "Молоко 1%", qty: 1000, unit: "мл" },
        ],
      },
    ]);
    const result = renderHarness();
    let ticket: PantryConsumeTicket | null = null;
    act(() => {
      ticket = result.current.consumePantryItem("Молоко", 200);
    });
    expect(result.current.variantChoice).not.toBeNull();
    ticket!.cancelled = true;
    act(() => result.current.resolveVariantChoice(null));
    expect(result.current.variantChoice).toBeNull();
    expect(homeItems(result)[0]).toMatchObject({ qty: 2000 });
    expect(ticket!.receipt).toBeNull();
  });
});
