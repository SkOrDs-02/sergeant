// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    nutritionApi: {
      parsePantry: vi.fn(),
    },
  };
});

import { useNutritionPantries } from "./useNutritionPantries";
import { nutritionApi } from "@shared/api";
const apiParsePantry = nutritionApi.parsePantry as unknown as ReturnType<
  typeof vi.fn
>;
import { type Pantry } from "../lib/nutritionStorage";
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

// Stage 8 PR #057n-tombstone: seed the SQLite warm cache directly
// instead of LS, since `useNutritionPantries` initial state now reads
// from `getCachedNutritionSqliteState`. The hook's overlay effect
// re-runs on `notifyNutritionSqliteCacheRefresh()` so we bump the tick
// after each seed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function seedPantries(pantries: any[], activeId: string) {
  __setNutritionSqliteCacheForTests({
    pantries,
    activePantryId: String(activeId),
  });
  notifyNutritionSqliteCacheRefresh();
}

function renderHarness() {
  const setBusy = vi.fn();
  const setErr = vi.fn();
  const setStatusText = vi.fn();
  const { result } = renderHook(
    () => useNutritionPantries({ setBusy, setErr, setStatusText }),
    { wrapper: makeWrapper() },
  );
  return { result, setBusy, setErr, setStatusText };
}

describe("useNutritionPantries", () => {
  beforeEach(() => {
    localStorage.clear();
    clearNutritionSqliteCache();
    vi.clearAllMocks();
  });

  describe("parsePantry validation", () => {
    it("surfaces validation error when pantryText is empty", async () => {
      seedPantries([{ id: "home", name: "Дім", items: [], text: "" }], "home");
      const { result, setErr } = renderHarness();
      act(() => {
        result.current.parsePantry();
      });
      await waitFor(() => {
        expect(setErr).toHaveBeenCalledWith("Надиктуй/впиши список продуктів.");
      });
      expect(apiParsePantry).not.toHaveBeenCalled();
    });
  });

  describe("parsePantry happy path", () => {
    it("posts text, stages parsed items in preview until confirmed", async () => {
      seedPantries(
        [{ id: "home", name: "Дім", items: [], text: "молоко, яйця" }],
        "home",
      );
      apiParsePantry.mockResolvedValueOnce({
        items: [
          { name: "молоко", qty: 1, unit: "л" },
          { name: "яйця", qty: 10, unit: "шт" },
        ],
      });
      const { result } = renderHarness();

      act(() => {
        result.current.parsePantry();
      });

      // Розібране НЕ потрапляє в комору одразу — спершу превʼю.
      await waitFor(() => {
        expect(result.current.parsePreview?.items.length).toBe(2);
      });
      expect(result.current.parsePreview?.source).toBe("ai");
      expect(result.current.pantryItems.length).toBe(0);
      expect(result.current.pantryText).toBe("молоко, яйця");

      act(() => {
        result.current.confirmParsePreview(result.current.parsePreview!.items);
      });

      await waitFor(() => {
        expect(result.current.pantryItems.length).toBe(2);
      });
      expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result.current.pantryItems.map((x: any) => x.name),
      ).toEqual(["молоко", "яйця"]);
      expect(result.current.parsePreview).toBeNull();
      // text cleared after the user confirms
      expect(result.current.pantryText).toBe("");
      expect(apiParsePantry).toHaveBeenCalledWith({
        text: "молоко, яйця",
        locale: "uk-UA",
      });
    });
  });

  describe("розбір списку кладе позиції по місцях", () => {
    it("розкладає підтверджені позиції за суттю, а не в одну купу", async () => {
      seedPantries(
        [{ id: "home", name: "Дім", items: [], text: "молоко" }],
        "home",
      );

      // Deferred promise — we resolve after the user switches pantries.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let resolveParse: (value: any) => void;
      apiParsePantry.mockImplementationOnce(
        () =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          new Promise<any>((res) => {
            resolveParse = res;
          }),
      );

      const { result } = renderHarness();

      act(() => {
        result.current.parsePantry();
      });
      await waitFor(() => expect(apiParsePantry).toHaveBeenCalled());

      await act(async () => {
        resolveParse!({
          items: [
            { name: "молоко", qty: 1, unit: "л" },
            { name: "пельмені", qty: 1, unit: "кг" },
          ],
        });
      });

      await waitFor(() => expect(result.current.parsePreview).not.toBeNull());
      act(() => {
        result.current.confirmParsePreview(result.current.parsePreview!.items);
      });

      await waitFor(() =>
        expect(result.current.pantryItems.length).toBeGreaterThan(0),
      );

      const fridge = result.current.pantries.find(
        (p: Pantry) => p.id === "fridge",
      );
      const freezer = result.current.pantries.find(
        (p: Pantry) => p.id === "freezer",
      );
      const home = result.current.pantries.find((p: Pantry) => p.id === "home");
      expect(fridge!.items.map((i) => i.name)).toEqual(["молоко"]);
      expect(freezer!.items.map((i) => i.name)).toEqual(["пельмені"]);
      expect(home!.items).toEqual([]);
      // Чернетка тексту очистилась саме там, де жила.
      expect(home!.text).toBe("");
    });
  });
});
