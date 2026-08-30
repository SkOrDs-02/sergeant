// @vitest-environment jsdom
/**
 * W1-PANTRY-APPEND, СТАДІЯ 2 — пʼять мутаторів `useNutritionPantries.ts`
 * мають емітити ledger-подію ПАРАЛЕЛЬНО старому запису `qty`. Тест не йде
 * крізь реальний SQLite-пайплайн (важко піднімати заради самого факту
 * виклику) — мокає `appendNutritionPantryEvent`/`backfillNutritionPantryCheckpoints`
 * з `nutritionStorage.ts` і перевіряє, з яким payload-ом кожен мутатор їх
 * кличе. Старий запис `qty` лишається окремо покритий
 * `useNutritionPantries.consume.test.tsx` / `.crud.test.tsx`.
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
  appendNutritionPantryEvent,
  type NutritionPantryEventSnapshot,
} from "../lib/nutritionStorage";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../lib/sqliteReader";
import { notifyNutritionSqliteCacheRefresh } from "../lib/sqliteReadGate";

const appendMock = vi.mocked(appendNutritionPantryEvent);

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

function lastEvent(): NutritionPantryEventSnapshot {
  expect(appendMock).toHaveBeenCalledTimes(1);
  return appendMock.mock.calls[0]![0];
}

describe("useNutritionPantries — ledger-подія на кожен з пʼяти мутаторів", () => {
  beforeEach(() => {
    localStorage.clear();
    clearNutritionSqliteCache();
    appendMock.mockClear();
  });

  it("upsertItem → 'replenish' з deltaQty = кількість, що додається", () => {
    seedPantries([]);
    const result = renderHarness();
    act(() => result.current.upsertItem("рис 500 г"));
    const ev = lastEvent();
    expect(ev.kind).toBe("replenish");
    expect(ev.deltaQty).toBe(500);
    expect(ev.absQty).toBeNull();
    expect(ev.unit).toBe("г");
    expect(ev.source).toBe("manual");
    expect(ev.pantryId).toBe("home");
  });

  it("upsertItem без qty (гола назва) НЕ емітить подію", () => {
    seedPantries([]);
    const result = renderHarness();
    act(() => result.current.upsertItem("сіль"));
    expect(appendMock).not.toHaveBeenCalled();
  });

  it("removeItem → чекпойнт 'adjust' на absQty=0", () => {
    seedPantries([{ name: "рис", qty: 500, unit: "г", notes: null }]);
    const result = renderHarness();
    act(() => result.current.removeItem("рис"));
    const ev = lastEvent();
    expect(ev.kind).toBe("adjust");
    expect(ev.absQty).toBe(0);
    expect(ev.deltaQty).toBeNull();
    expect(ev.source).toBe("manual");
  });

  it("removeItemAt → чекпойнт 'adjust' на absQty=0, за іменем позиції на idx", () => {
    seedPantries([{ name: "гречка", qty: 300, unit: "г", notes: null }]);
    const result = renderHarness();
    act(() => result.current.removeItemAt(0));
    const ev = lastEvent();
    expect(ev.kind).toBe("adjust");
    expect(ev.absQty).toBe(0);
    expect(ev.itemKey).toBe("гречка");
  });

  it("onSaveItemEdit → чекпойнт 'adjust' на введену кількість", () => {
    seedPantries([{ name: "цукор", qty: 200, unit: "г", notes: null }]);
    const result = renderHarness();
    act(() => result.current.onSaveItemEdit(0, "цукор", 750, "г"));
    const ev = lastEvent();
    expect(ev.kind).toBe("adjust");
    expect(ev.absQty).toBe(750);
    expect(ev.deltaQty).toBeNull();
    expect(ev.unit).toBe("г");
  });

  it("onSaveItemEdit із очищеною кількістю (null) НЕ емітить подію", () => {
    seedPantries([{ name: "цукор", qty: 200, unit: "г", notes: null }]);
    const result = renderHarness();
    act(() => result.current.onSaveItemEdit(0, "цукор", null, "г"));
    expect(appendMock).not.toHaveBeenCalled();
  });

  it("consumePantryItem → 'consume' з deltaQty = -(реально списана кількість)", () => {
    seedPantries([{ name: "рис", qty: 500, unit: "г", notes: null }]);
    const result = renderHarness();
    act(() => result.current.consumePantryItem("рис", 120));
    const ev = lastEvent();
    expect(ev.kind).toBe("consume");
    expect(ev.deltaQty).toBe(-120);
    expect(ev.absQty).toBeNull();
    expect(ev.source).toBe("meal_log");
    expect(ev.unit).toBe("г");
  });

  it("consumePantryItem на невідому позицію НЕ емітить подію", () => {
    seedPantries([{ name: "рис", qty: 100, unit: "г", notes: null }]);
    const result = renderHarness();
    act(() => result.current.consumePantryItem("гречка", 50));
    expect(appendMock).not.toHaveBeenCalled();
  });
});
