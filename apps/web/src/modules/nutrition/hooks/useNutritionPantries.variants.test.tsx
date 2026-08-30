// @vitest-environment jsdom
/**
 * Картка продукту в коморі — вибір варіанта при списанні і скидання
 * варіантів при ручній зміні кількості (спека
 * `docs/90-work/planning/specs/pantry-generic-names.md`, рішення 11 і
 * § Ризики).
 *
 * Гарячий шлях тут — саме той, що всередині збереження прийому їжі: діалог
 * має зʼявлятись від ДВОХ варіантів і не зʼявлятись від одного, інакше
 * швидкий сценарій дорожчає на кожному логу.
 */
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return { ...actual, nutritionApi: { parsePantry: vi.fn() } };
});

vi.mock("../lib/nutritionStorage", async () => {
  const actual = await vi.importActual<
    typeof import("../lib/nutritionStorage")
  >("../lib/nutritionStorage");
  return {
    ...actual,
    appendNutritionPantryEvent: vi.fn(),
    backfillNutritionPantryCheckpoints: vi.fn(),
  };
});

import { useNutritionPantries } from "./useNutritionPantries";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../lib/sqliteReader";
import { notifyNutritionSqliteCacheRefresh } from "../lib/sqliteReadGate";
import type { PantryItem } from "@sergeant/nutrition-domain";

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

function seedPantries(items: PantryItem[]) {
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

const MILK_WITH_TWO: PantryItem = {
  name: "Молоко",
  qty: 2000,
  unit: "мл",
  notes: null,
  sources: [
    {
      name: "Молоко Яготинське 2.6%",
      qty: 900,
      unit: "мл",
      addedAt: "2026-08-21",
    },
    {
      name: "Молоко Галичина 1%",
      qty: 1100,
      unit: "мл",
      addedAt: "2026-08-28",
    },
  ],
};

describe("useNutritionPantries — варіанти позиції", () => {
  beforeEach(() => {
    localStorage.clear();
    clearNutritionSqliteCache();
  });

  it("два варіанти — питаємо, з якого списати, і нічого не чіпаємо до відповіді", () => {
    seedPantries([MILK_WITH_TWO]);
    const result = renderHarness();

    act(() => result.current.consumePantryItem("Молоко", 200));

    expect(result.current.variantChoice?.itemName).toBe("Молоко");
    expect(result.current.variantChoice?.sources).toHaveLength(2);
    expect(result.current.pantryItems[0]?.qty).toBe(2000);
  });

  it("вибір варіанта списує саме з нього", () => {
    seedPantries([MILK_WITH_TWO]);
    const result = renderHarness();

    act(() => result.current.consumePantryItem("Молоко", 200));
    act(() => result.current.resolveVariantChoice("Молоко Галичина 1%"));

    const item = result.current.pantryItems[0]!;
    expect(result.current.variantChoice).toBeNull();
    expect(item.sources?.[0]?.qty).toBe(900);
    expect(item.sources?.[1]?.qty).toBeLessThan(1100);
    // Інваріант: кількість позиції — це сума варіантів, не окреме число.
    expect(item.qty).toBe(
      (item.sources ?? []).reduce((sum, s) => sum + s.qty, 0),
    );
  });

  it("один варіант — жодного діалогу, списання тихе", () => {
    seedPantries([
      {
        ...MILK_WITH_TWO,
        qty: 900,
        sources: [MILK_WITH_TWO.sources![0]!],
      },
    ]);
    const result = renderHarness();

    act(() => result.current.consumePantryItem("Молоко", 200));

    expect(result.current.variantChoice).toBeNull();
    expect(result.current.pantryItems[0]?.qty).toBeLessThan(900);
  });

  it("перейменування зберігає варіанти, ручна зміна кількості — скидає", () => {
    seedPantries([MILK_WITH_TWO]);
    const result = renderHarness();

    act(() => result.current.onSaveItemEdit(0, "Молочко", 2000, "мл"));
    expect(result.current.pantryItems[0]?.name).toBe("Молочко");
    expect(result.current.pantryItems[0]?.sources).toHaveLength(2);

    // Число від руки — ми не знаємо, з якої покупки воно взялось, тож
    // чесніше втратити розклад, ніж показувати суму, якої немає.
    act(() => result.current.onSaveItemEdit(0, "Молочко", 1500, "мл"));
    expect(result.current.pantryItems[0]?.qty).toBe(1500);
    expect(result.current.pantryItems[0]?.sources ?? null).toBeNull();
  });
});
