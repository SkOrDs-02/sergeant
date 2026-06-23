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
  const { result } = renderHook(
    () => useNutritionPantries({ setBusy, setErr, setStatusText }),
    { wrapper: makeWrapper() },
  );
  return { result };
}

beforeEach(() => {
  localStorage.clear();
  clearNutritionSqliteCache();
  vi.clearAllMocks();
});

describe("useNutritionPantries CRUD", () => {
  it("creates a new pantry and makes it active", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    act(() => result.current.beginCreatePantry());
    expect(result.current.pantryForm.mode).toBe("create");
    expect(result.current.pantryManagerOpen).toBe(true);

    act(() => result.current.onSavePantryForm("Дача", "create"));
    expect(result.current.pantries.some((p) => p.name === "Дача")).toBe(true);
    // new pantry became active
    expect(result.current.activePantry.name).toBe("Дача");
    expect(result.current.pantryManagerOpen).toBe(false);
  });

  it("renames the active pantry", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    act(() => result.current.beginRenamePantry());
    expect(result.current.pantryForm.mode).toBe("rename");

    act(() => result.current.onSavePantryForm("Кухня", "rename"));
    expect(result.current.activePantry.name).toBe("Кухня");
  });

  it("deletes a pantry only when more than one exists", () => {
    seed(
      [
        { id: "home", name: "Дім", items: [], text: "" },
        { id: "dacha", name: "Дача", items: [], text: "" },
      ],
      "home",
    );
    const { result } = renderHarness();

    act(() => result.current.beginDeletePantry());
    expect(result.current.confirmDeleteOpen).toBe(true);

    act(() => result.current.onConfirmDeletePantry());
    expect(result.current.pantries).toHaveLength(1);
    expect(result.current.pantries[0]?.id).toBe("dacha");
  });

  it("refuses to delete the last pantry", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();
    act(() => result.current.onConfirmDeletePantry());
    expect(result.current.pantries).toHaveLength(1);
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

    act(() => result.current.onSaveItemEdit(0, 5, "л"));
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
