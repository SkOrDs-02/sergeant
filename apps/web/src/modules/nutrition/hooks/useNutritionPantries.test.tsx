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
    it("posts text, merges parsed items into active pantry", async () => {
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

      await waitFor(() => {
        expect(result.current.pantryItems.length).toBe(2);
      });
      expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result.current.pantryItems.map((x: any) => x.name),
      ).toEqual(["молоко", "яйця"]);
      // text cleared after successful parse
      expect(result.current.pantryText).toBe("");
      expect(apiParsePantry).toHaveBeenCalledWith({
        text: "молоко, яйця",
        locale: "uk-UA",
      });
    });
  });

  describe("regression: pantryId captured at mutate-time (issue #189)", () => {
    it("merges parsed items into the ORIGINAL pantry even if user switches active pantry mid-flight", async () => {
      seedPantries(
        [
          { id: "home", name: "Дім", items: [], text: "молоко" },
          { id: "work", name: "Робота", items: [], text: "" },
        ],
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
      expect(result.current.activePantryId).toBe("home");

      // Kick off parse — captures pantryId = "home" at mutate-time.
      act(() => {
        result.current.parsePantry();
      });
      // Wait for mutationFn to actually invoke the mock (resolveParse set).
      await waitFor(() => expect(apiParsePantry).toHaveBeenCalled());

      // User switches to "work" while API is still in flight.
      act(() => {
        result.current.setActivePantryId("work");
      });
      expect(result.current.activePantryId).toBe("work");

      // Now resolve — items must still go to "home", not "work".
      await act(async () => {
        resolveParse!({ items: [{ name: "молоко", qty: 1, unit: "л" }] });
      });

      await waitFor(() => {
        const home = result.current.pantries.find(
          (p: Pantry) => p.id === "home",
        );
        expect(home?.items?.length).toBe(1);
      });

      const home = result.current.pantries.find((p: Pantry) => p.id === "home");
      const work = result.current.pantries.find((p: Pantry) => p.id === "work");
      expect(home!.items[0]!.name).toBe("молоко");
      expect(work!.items).toEqual([]);
      // Active remained "work" (user's choice).
      expect(result.current.activePantryId).toBe("work");
    });
  });
});
