// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Coverage for the pantry CRUD surface of `useNutritionPantries`
 * (create / rename / delete / item edit + remove / text + summary).
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

import { useNutritionPantries } from "./useNutritionPantries";
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
function seed(pantries: any[], activeId: string) {
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
  const { result, unmount } = renderHook(
    () => useNutritionPantries({ setBusy, setErr, setStatusText }),
    { wrapper: makeWrapper() },
  );
  return { result, unmount };
}

beforeEach(() => {
  localStorage.clear();
  clearNutritionSqliteCache();
  vi.clearAllMocks();
});

describe("useNutritionPantries CRUD", () => {
  it("seeds the three known storage places", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();
    expect(result.current.pantries.map((p) => p.id)).toEqual([
      "fridge",
      "freezer",
      "home",
    ]);
    expect(result.current.pantries[2]?.name).toBe("Комора");
  });

  it("creates a custom place", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    act(() => result.current.beginCreatePantry());
    expect(result.current.pantryForm.mode).toBe("create");
    expect(result.current.pantryManagerOpen).toBe(true);

    act(() => result.current.onSavePantryForm("Балкон", "create"));
    expect(result.current.pantries.some((p) => p.name === "Балкон")).toBe(true);
    expect(result.current.pantryManagerOpen).toBe(false);
  });

  it("renames the place it was asked to rename", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    act(() => result.current.beginRenamePantry("fridge"));
    expect(result.current.pantryForm.mode).toBe("rename");
    expect(result.current.pantryForm.targetId).toBe("fridge");

    act(() => result.current.onSavePantryForm("Кухонний", "rename"));
    expect(result.current.pantries.find((p) => p.id === "fridge")?.name).toBe(
      "Кухонний",
    );
  });

  it("deletes a custom place", () => {
    seed(
      [
        { id: "home", name: "Дім", items: [], text: "" },
        { id: "dacha", name: "Дача", items: [], text: "" },
      ],
      "home",
    );
    const { result } = renderHarness();

    act(() => result.current.beginDeletePantry("dacha"));
    expect(result.current.confirmDeleteOpen).toBe(true);

    act(() => result.current.onConfirmDeletePantry());
    expect(result.current.pantries.map((p) => p.id)).toEqual([
      "fridge",
      "freezer",
      "home",
    ]);
  });

  // Три відомі місця — адреси автовизначення: без морозилки пельмені
  // поїхали б у неіснуючий id, і вгадування мовчки перестало б працювати.
  it("refuses to delete a known place", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();
    act(() => result.current.beginDeletePantry("freezer"));
    expect(result.current.confirmDeleteOpen).toBe(false);
    act(() => result.current.onConfirmDeletePantry());
    expect(result.current.pantries).toHaveLength(3);
  });

  // Гейт 1 спеки на рівні хука: нова позиція лягає у вгадане місце.
  it("routes a new item into its guessed place", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    act(() => result.current.upsertItem("Пельмені 1 кг"));
    expect(result.current.pantryItems[0]?.pantryId).toBe("freezer");
  });

  // Гейт 2 спеки: ручне розміщення сильніше за автовизначення — і при
  // повторному доливанні, і після перемонтування (перезавантаження).
  it("keeps a manually placed item where the human put it", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result, unmount } = renderHarness();

    act(() => result.current.upsertItem("Молоко 1 л"));
    expect(result.current.pantryItems[0]?.pantryId).toBe("fridge");

    act(() => result.current.moveItemTo(0, "home"));
    expect(result.current.pantryItems[0]?.pantryId).toBe("home");

    // Повторне доливання НЕ тягне позицію назад у холодильник.
    act(() => result.current.upsertItem("Молоко 500 мл"));
    expect(result.current.pantryItems).toHaveLength(1);
    expect(result.current.pantryItems[0]?.pantryId).toBe("home");

    const snapshot = result.current.pantries;
    unmount();
    seed(snapshot, "home");
    const reopened = renderHarness();
    expect(reopened.result.current.pantryItems[0]?.pantryId).toBe("home");
  });

  // Гейт 5 спеки: план є, але нічого не рухається без дії людини.
  it("plans a redistribution without performing it", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    act(() => result.current.upsertItem("Молоко 1 л"));
    act(() => result.current.moveItemTo(0, "home"));
    expect(result.current.redistributePlan).toEqual([
      { name: "Молоко", fromId: "home", toId: "fridge" },
    ]);
    expect(result.current.pantryItems[0]?.pantryId).toBe("home");

    act(() => result.current.applyRedistribute());
    expect(result.current.pantryItems[0]?.pantryId).toBe("fridge");
    expect(result.current.redistributePlan).toEqual([]);
  });

  it("upserts and removes items by name", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    act(() => result.current.upsertItem("Молоко 1 л"));
    expect(result.current.pantryItems.some((x) => /молоко/i.test(x.name))).toBe(
      true,
    );

    const name = result.current.pantryItems[0]?.name ?? "";
    act(() => result.current.removeItem(name));
    expect(result.current.pantryItems).toHaveLength(0);
  });

  // B7 — комора показує назву як її ввела людина; зіставлення (видалення,
  // списання) лишається нечутливим до регістру.
  it("keeps the typed capitalization of a product name", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    act(() => result.current.upsertItem("Яготинське молоко 1 л"));
    expect(result.current.pantryItems[0]).toMatchObject({
      name: "Яготинське молоко",
      qty: 1,
      unit: "л",
    });

    // сканер штрих-кодів шле бренд одним рядком
    act(() => result.current.upsertItem("Coca-Cola Zero"));
    expect(result.current.pantryItems.map((x) => x.name)).toContain(
      "Coca-Cola Zero",
    );

    // видалення ловить позицію попри інший регістр
    act(() => result.current.removeItem("яготинське МОЛОКО"));
    expect(result.current.pantryItems.map((x) => x.name)).toEqual([
      "Coca-Cola Zero",
    ]);
  });

  it("matches an old lowercase record when consuming a mixed-case name", () => {
    seed(
      [
        {
          id: "home",
          name: "Дім",
          items: [{ name: "гречка", qty: 1000, unit: "г", notes: null }],
          text: "",
        },
      ],
      "home",
    );
    const { result } = renderHarness();
    act(() => result.current.consumePantryItem("Гречка", 200));
    expect(result.current.pantryItems[0]).toMatchObject({
      name: "гречка",
      qty: 800,
    });
  });

  it("opens the item editor and saves a qty/unit change", () => {
    seed(
      [
        {
          id: "home",
          name: "Дім",
          items: [{ name: "Молоко", qty: 2, unit: "л", notes: null }],
          text: "",
        },
      ],
      "home",
    );
    const { result } = renderHarness();

    act(() => result.current.editItemAt(0));
    expect(result.current.itemEdit.open).toBe(true);
    expect(result.current.itemEdit.name).toMatch(/молоко/i);

    act(() => result.current.onSaveItemEdit(0, "Молоко", 5, "л"));
    expect(result.current.pantryItems[0]?.qty).toBe(5);
    expect(result.current.itemEdit.open).toBe(false);
  });

  it("removes an item by index", () => {
    seed(
      [
        {
          id: "home",
          name: "Дім",
          items: [
            { name: "Молоко", qty: 1, unit: "л", notes: null },
            { name: "Хліб", qty: 1, unit: "шт", notes: null },
          ],
          text: "",
        },
      ],
      "home",
    );
    const { result } = renderHarness();
    act(() => result.current.removeItemAt(0));
    expect(result.current.pantryItems).toHaveLength(1);
    expect(result.current.pantryItems[0]?.name).toMatch(/хліб/i);
  });

  it("consumes grams from a mass-based pantry item", () => {
    seed(
      [
        {
          id: "home",
          name: "Дім",
          items: [{ name: "Гречка", qty: 1000, unit: "г", notes: null }],
          text: "",
        },
      ],
      "home",
    );
    const { result } = renderHarness();
    act(() => result.current.consumePantryItem("Гречка", 200));
    expect(result.current.pantryItems[0]?.qty).toBe(800);
  });

  it("updates pantry text and summarizes items", () => {
    seed(
      [
        {
          id: "home",
          name: "Дім",
          items: [{ name: "Сир", qty: 1, unit: "шт", notes: null }],
          text: "",
        },
      ],
      "home",
    );
    const { result } = renderHarness();
    expect(result.current.pantrySummary).toMatch(/сир/i);

    act(() => result.current.setPantryText("молоко, яйця"));
    expect(result.current.pantryText).toBe("молоко, яйця");
  });

  it("derives effectiveItems from loose text when no structured items", () => {
    seed(
      [{ id: "home", name: "Дім", items: [], text: "молоко\nхліб" }],
      "home",
    );
    const { result } = renderHarness();
    expect(result.current.effectiveItems.length).toBeGreaterThan(0);
  });
});
