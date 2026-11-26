// @vitest-environment jsdom
/**
 * Last validated: 2026-11-26
 * Status: Active
 * Стан, що прийшов із SQLite-кешу після pull, не повертається в outbox:
 * інакше пристрої без жодної дії користувача перекидали одне одному всю
 * комору (прод 2026-11-26).
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

vi.mock("../../../core/access/useCanUse", async () => {
  const actual = await vi.importActual<
    typeof import("../../../core/access/useCanUse")
  >("../../../core/access/useCanUse");
  return {
    ...actual,
    useCanUse: () => () => null,
    useAccessGuard: () => (_feature: unknown, run: () => void) => run(),
  };
});

import { useNutritionPantries } from "./useNutritionPantries";
import * as nutritionStorage from "../lib/nutritionStorage";
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

function pullCache(names: Record<string, string>) {
  const items = Object.entries(names).map(([id, name]) => ({
    id,
    name,
    qty: null,
    unit: null,
    notes: null,
  }));
  __setNutritionSqliteCacheForTests({
    pantries: [{ id: "home", name: "Дім", items, text: "" }],
    activePantryId: "home",
    refreshedAt: new Date().toISOString(),
  });
}

beforeEach(() => {
  localStorage.clear();
  clearNutritionSqliteCache();
  vi.restoreAllMocks();
});

describe("useNutritionPantries — pull echo", () => {
  it("does not persist pantries that arrived from a cache refresh", () => {
    pullCache({});
    const persist = vi.spyOn(nutritionStorage, "persistPantries");
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

    // Два pull-и поспіль приносять чужі позиції.
    act(() => {
      pullCache({ milk: "Молоко" });
      notifyNutritionSqliteCacheRefresh();
    });
    act(() => {
      pullCache({ milk: "Молоко", eggs: "Яйця" });
      notifyNutritionSqliteCacheRefresh();
    });
    expect(result.current.pantryItems.map((it) => it.name).sort()).toEqual([
      "Молоко",
      "Яйця",
    ]);
    expect(persist).not.toHaveBeenCalled();

    // Дія користувача після гідрації і далі зберігається.
    act(() => result.current.setPantryText("хліб"));
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
