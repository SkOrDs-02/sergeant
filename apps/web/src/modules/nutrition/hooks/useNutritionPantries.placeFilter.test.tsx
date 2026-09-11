// @vitest-environment jsdom
/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * Рішення власника 2026-09-11 (канон nutrition § Журнал рішень): коли
 * `placeFilter` звужує перегляд, НОВА позиція лягає у фільтр, а не у
 * вгадане евристикою місце; НАЯВНА позиція завжди лишається на своєму
 * фактичному місці. Без фільтра (`placeFilter === null`) поведінка
 * незмінна — чиста евристика `resolvePlaceForItem`.
 *
 * Заразом покриває `onItemsAdded` — колбек, через який хук повідомляє
 * викликача (page-рівень, тост «куди лягло»), куди саме лягла кожна нова
 * позиція, без прямого доступу хука до `useToast()`.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return { ...actual, nutritionApi: { parsePantry: vi.fn() } };
});

import { useNutritionPantries } from "./useNutritionPantries";
import { nutritionApi } from "@shared/api";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../lib/sqliteReader";
import { notifyNutritionSqliteCacheRefresh } from "../lib/sqliteReadGate";

const apiParsePantry = nutritionApi.parsePantry as unknown as ReturnType<
  typeof vi.fn
>;

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
function seed(pantries: any[], activeId: string) {
  __setNutritionSqliteCacheForTests({
    pantries,
    activePantryId: String(activeId),
  });
  notifyNutritionSqliteCacheRefresh();
}

function renderHarness(onItemsAdded?: (items: unknown[]) => void) {
  const setBusy = vi.fn();
  const setErr = vi.fn();
  const setStatusText = vi.fn();
  const { result } = renderHook(
    () =>
      useNutritionPantries({
        setBusy,
        setErr,
        setStatusText,
        ...(onItemsAdded ? { onItemsAdded } : {}),
      }),
    { wrapper: makeWrapper() },
  );
  return { result };
}

beforeEach(() => {
  localStorage.clear();
  clearNutritionSqliteCache();
  vi.clearAllMocks();
});

describe("useNutritionPantries — placeOf з активним placeFilter", () => {
  it("filter set + нова позиція → лягає у фільтр, а не в евристику", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    // Евристика для «Молоко» — холодильник (pantryPlacement.test.ts),
    // а не морозилка: фільтр нижче має її перебити.
    act(() => result.current.setPlaceFilter("freezer"));
    act(() => result.current.upsertItem("Молоко"));

    const freezer = result.current.pantries.find((p) => p.id === "freezer");
    const fridge = result.current.pantries.find((p) => p.id === "fridge");
    expect(freezer?.items.map((i) => i.name)).toEqual(["Молоко"]);
    expect(fridge?.items ?? []).toEqual([]);
  });

  it("filter set + наявна позиція деінде → лишається на своєму місці", () => {
    seed(
      [
        { id: "home", name: "Дім", items: [], text: "" },
        {
          id: "fridge",
          name: "Холодильник",
          items: [{ name: "Молоко", qty: 1, unit: "л", notes: null }],
          text: "",
        },
      ],
      "home",
    );
    const { result } = renderHarness();

    act(() => result.current.setPlaceFilter("freezer"));
    act(() => result.current.upsertItem("Молоко 1л"));

    const freezer = result.current.pantries.find((p) => p.id === "freezer");
    const fridge = result.current.pantries.find((p) => p.id === "fridge");
    // Наявна позиція долилась у ХОЛОДИЛЬНИК — фільтр перегляду не переносить
    // те, що вже лежить деінде.
    expect(freezer?.items ?? []).toEqual([]);
    expect(fridge?.items.map((i) => i.name)).toEqual(["Молоко"]);
  });

  it("filter null → чиста евристика (без фільтра)", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    expect(result.current.placeFilter).toBeNull();
    act(() => result.current.upsertItem("Молоко"));

    const fridge = result.current.pantries.find((p) => p.id === "fridge");
    expect(fridge?.items.map((i) => i.name)).toEqual(["Молоко"]);
  });
});

describe("useNutritionPantries — onItemsAdded", () => {
  it("manual single-item upsert повідомляє name+pantryId", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const onItemsAdded = vi.fn();
    const { result } = renderHarness(onItemsAdded);

    act(() => result.current.upsertItem("Молоко"));

    expect(onItemsAdded).toHaveBeenCalledTimes(1);
    expect(onItemsAdded).toHaveBeenCalledWith([
      { name: "Молоко", pantryId: "fridge" },
    ]);
  });

  it("резолв неоднозначної кількості (шт/г) теж репортує через onItemsAdded", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const onItemsAdded = vi.fn();
    const { result } = renderHarness(onItemsAdded);

    act(() => result.current.upsertItem("Яйце 150"));
    expect(result.current.ambiguousPantryItems.length).toBe(1);
    expect(onItemsAdded).not.toHaveBeenCalled();

    act(() => result.current.resolveAmbiguousPantryItem(0, "шт"));
    expect(onItemsAdded).toHaveBeenCalledTimes(1);
    // «Яйце» → категорія dairy_eggs → евристика кладе в холодильник.
    expect(onItemsAdded).toHaveBeenCalledWith([
      { name: "Яйце", pantryId: "fridge" },
    ]);
  });

  it("список (parsePreview → confirm) репортує всі позиції одним викликом", async () => {
    seed(
      [{ id: "home", name: "Дім", items: [], text: "молоко, яйця" }],
      "home",
    );
    apiParsePantry.mockResolvedValueOnce({
      items: [
        { name: "молоко", qty: 1, unit: "л" },
        { name: "яйця", qty: 10, unit: "шт" },
      ],
    });
    const onItemsAdded = vi.fn();
    const { result } = renderHarness(onItemsAdded);

    act(() => result.current.parsePantry());
    await waitFor(() => expect(result.current.parsePreview).not.toBeNull());

    act(() =>
      result.current.confirmParsePreview(result.current.parsePreview!.items),
    );

    expect(onItemsAdded).toHaveBeenCalledTimes(1);
    const [[items]] = onItemsAdded.mock.calls as [
      [{ name: string; pantryId: string }[]],
    ];
    expect(items.map((i) => i.name).sort()).toEqual(["молоко", "яйця"].sort());
  });
});
