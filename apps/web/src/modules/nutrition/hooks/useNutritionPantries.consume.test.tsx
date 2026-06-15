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
      }),
    { wrapper: makeWrapper() },
  );
  return result;
}

function activeItems(result: { current: { pantries: Pantry[] } }) {
  return result.current.pantries.find((p) => p.id === "home")?.items ?? [];
}

describe("useNutritionPantries.consumePantryItem (F15 uom-conversion)", () => {
  beforeEach(() => {
    localStorage.clear();
    clearNutritionSqliteCache();
    vi.clearAllMocks();
  });

  it("г: списує грами 1:1, округлює до 0.1", () => {
    seedPantries([{ name: "рис", qty: 500, unit: "г", notes: null }]);
    const result = renderHarness();
    act(() => result.current.consumePantryItem("рис", 120));
    expect(activeItems(result)[0]).toMatchObject({ qty: 380, unit: "г" });
  });

  it("кг: конвертує грами в кілограми", () => {
    seedPantries([{ name: "рис", qty: 1, unit: "кг", notes: null }]);
    const result = renderHarness();
    act(() => result.current.consumePantryItem("рис", 250));
    expect(activeItems(result)[0]).toMatchObject({ qty: 0.8, unit: "кг" });
  });

  it("мл: списує через густину молока (1.03 г/мл)", () => {
    seedPantries([{ name: "молоко", qty: 500, unit: "мл", notes: null }]);
    const result = renderHarness();
    act(() => result.current.consumePantryItem("молоко", 200));
    // 500 - 200/1.03 = 305.8 (округлено до 0.1)
    expect(activeItems(result)[0]?.qty).toBeCloseTo(305.8, 1);
  });

  it("л: 2 л молока − 206 г ≈ 1.8 л (F15 H2 — більше не з'їдає всю пляшку)", () => {
    seedPantries([{ name: "молоко", qty: 2, unit: "л", notes: null }]);
    const result = renderHarness();
    act(() => result.current.consumePantryItem("молоко", 206));
    expect(activeItems(result)[0]?.qty).toBe(1.8);
  });

  it("шт: 10 шт яєць − 120 г (60 г/шт) = 8 шт", () => {
    seedPantries([{ name: "яйце", qty: 10, unit: "шт", notes: null }]);
    const result = renderHarness();
    act(() => result.current.consumePantryItem("яйце", 120));
    expect(activeItems(result)[0]).toMatchObject({ qty: 8, unit: "шт" });
  });

  it("уп: одиниця без масового відображення — позиція без змін", () => {
    seedPantries([{ name: "печиво", qty: 2, unit: "уп", notes: null }]);
    const result = renderHarness();
    act(() => result.current.consumePantryItem("печиво", 300));
    expect(activeItems(result)[0]).toMatchObject({ qty: 2, unit: "уп" });
  });

  it("залишок ≤ 0 → позицію видалено", () => {
    seedPantries([{ name: "рис", qty: 100, unit: "г", notes: null }]);
    const result = renderHarness();
    act(() => result.current.consumePantryItem("рис", 150));
    expect(activeItems(result)).toHaveLength(0);
  });

  it("невідома назва → no-op", () => {
    seedPantries([{ name: "рис", qty: 100, unit: "г", notes: null }]);
    const result = renderHarness();
    act(() => result.current.consumePantryItem("гречка", 50));
    expect(activeItems(result)[0]).toMatchObject({ qty: 100, unit: "г" });
  });
});
