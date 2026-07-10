// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Extra branch-coverage tests for useNutritionPantries.ts.
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
import * as nutritionStorage from "../lib/nutritionStorage";
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
function seed(pantries: any[], activeId: string, refreshedAt?: string | null) {
  __setNutritionSqliteCacheForTests({
    pantries,
    activePantryId: String(activeId),
    ...(refreshedAt !== undefined ? { refreshedAt } : {}),
  });
  notifyNutritionSqliteCacheRefresh();
}

function renderHarness() {
  const setBusy = vi.fn();
  const setErr = vi.fn();
  const setStatusText = vi.fn();
  const { result, rerender } = renderHook(
    () => useNutritionPantries({ setBusy, setErr, setStatusText }),
    { wrapper: makeWrapper() },
  );
  return { result, rerender, setBusy, setErr, setStatusText };
}

beforeEach(() => {
  localStorage.clear();
  clearNutritionSqliteCache();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("useNutritionPantries — parsePantry lifecycle branches", () => {
  it("sets busy/status on mutate and clears them on settle", async () => {
    seed([{ id: "home", name: "Дім", items: [], text: "молоко" }], "home");
    apiParsePantry.mockResolvedValueOnce({ items: [] });
    const { result, setBusy, setStatusText } = renderHarness();

    act(() => result.current.parsePantry());

    await waitFor(() => expect(setBusy).toHaveBeenCalledWith(true));
    expect(setStatusText).toHaveBeenCalledWith("Розбираю список…");
    await waitFor(() => expect(setBusy).toHaveBeenCalledWith(false));
    expect(setStatusText).toHaveBeenCalledWith("");
    expect(result.current.pantryText).toBe("");
  });

  it("surfaces thrown error messages through nutrition error helper", async () => {
    seed([{ id: "home", name: "Дім", items: [], text: "молоко" }], "home");
    apiParsePantry.mockRejectedValueOnce(new Error("network down"));
    const { result, setErr } = renderHarness();

    act(() => result.current.parsePantry());
    await waitFor(() =>
      expect(setErr).toHaveBeenLastCalledWith("network down"),
    );
  });
});

describe("useNutritionPantries — persist + SQLite overlay branches", () => {
  it("surfaces pantryStorageErr when persistPantries returns false", async () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    vi.spyOn(nutritionStorage, "persistPantries").mockReturnValue(false);
    const { result } = renderHarness();

    act(() => result.current.setPantryText("яйця"));
    await waitFor(() =>
      expect(result.current.pantryStorageErr).toBe(
        "Не вдалося зберегти дані складів.",
      ),
    );
  });

  it("overlays pantries from a warm SQLite cache when the read tick bumps", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result, rerender } = renderHarness();
    expect(result.current.activePantry.name).toBe("Дім");

    __setNutritionSqliteCacheForTests({
      pantries: [{ id: "work", name: "Офіс", items: [], text: "" }],
      activePantryId: "work",
      refreshedAt: new Date().toISOString(),
    });
    notifyNutritionSqliteCacheRefresh();
    rerender();

    expect(result.current.activePantryId).toBe("work");
    expect(result.current.activePantry.name).toBe("Офіс");
  });

  it("skips overlay when SQLite cache is cold (refreshedAt null)", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result, rerender } = renderHarness();

    __setNutritionSqliteCacheForTests({
      pantries: [{ id: "work", name: "Офіс", items: [], text: "" }],
      activePantryId: "work",
      refreshedAt: null,
    });
    notifyNutritionSqliteCacheRefresh();
    rerender();

    expect(result.current.activePantryId).toBe("home");
    expect(result.current.activePantry.name).toBe("Дім");
  });
});

describe("useNutritionPantries — item + pantry helper branches", () => {
  it("returns em-dash summary when there are no items", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();
    expect(result.current.pantrySummary).toBe("—");
  });

  it("upserts structured PantryItem objects and filters empty names", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    act(() =>
      result.current.upsertItem([
        { name: "  Сир  ", qty: 2, unit: "шт", notes: null },
        { name: "", qty: 1, unit: "шт", notes: null },
        { name: "Хліб", qty: Number.NaN, unit: "шт", notes: "fresh" },
      ]),
    );
    expect(result.current.pantryItems).toHaveLength(2);
    expect(result.current.pantryItems[0]?.name).toMatch(/сир/i);
    expect(result.current.pantryItems[1]?.qty).toBeNull();
  });

  it("no-ops removeItem and consumePantryItem on blank names", () => {
    seed(
      [
        {
          id: "home",
          name: "Дім",
          items: [{ name: "Рис", qty: 100, unit: "г", notes: null }],
          text: "",
        },
      ],
      "home",
    );
    const { result } = renderHarness();
    act(() => result.current.removeItem("   "));
    act(() => result.current.consumePantryItem("", 50));
    expect(result.current.pantryItems).toHaveLength(1);
  });

  it("falls back to the first pantry when activePantryId is unknown", () => {
    seed(
      [
        { id: "home", name: "Дім", items: [], text: "" },
        { id: "work", name: "Офіс", items: [], text: "" },
      ],
      "missing",
    );
    const { result } = renderHarness();
    expect(result.current.activePantry.name).toBe("Дім");
  });

  it("ensureStructuredItems hydrates from loose text before removeItemAt", async () => {
    seed(
      [{ id: "home", name: "Дім", items: [], text: "молоко 1 л\nхліб" }],
      "home",
    );
    const { result } = renderHarness();
    expect(result.current.pantryItems).toHaveLength(0);
    expect(result.current.effectiveItems.length).toBe(2);

    act(() => result.current.removeItemAt(0));
    await waitFor(() => expect(result.current.pantryItems).toHaveLength(1));
  });

  it("editItemAt no-ops when index is out of range", () => {
    seed(
      [
        {
          id: "home",
          name: "Дім",
          items: [{ name: "Молоко", qty: 1, unit: "л", notes: null }],
          text: "",
        },
      ],
      "home",
    );
    const { result } = renderHarness();
    act(() => result.current.editItemAt(99));
    expect(result.current.itemEdit.open).toBe(false);
  });

  it("onSaveItemEdit clears qty to null and ignores missing rows", () => {
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

    act(() => result.current.onSaveItemEdit(0, "", "л"));
    expect(result.current.pantryItems[0]?.qty).toBeNull();

    const before = result.current.pantryItems.length;
    act(() => result.current.onSaveItemEdit(5, 3, "л"));
    expect(result.current.pantryItems).toHaveLength(before);
  });

  it("consumePantryItem no-ops when qty is zero or non-finite", () => {
    seed(
      [
        {
          id: "home",
          name: "Дім",
          items: [
            { name: "Спеції", qty: 0, unit: "г", notes: null },
            { name: "Сіль", qty: null, unit: "г", notes: null },
          ],
          text: "",
        },
      ],
      "home",
    );
    const { result } = renderHarness();
    act(() => result.current.consumePantryItem("Спеції", 10));
    act(() => result.current.consumePantryItem("Сіль", 10));
    expect(result.current.pantryItems).toHaveLength(2);
  });
});
