// @vitest-environment jsdom
/**
 * Last validated: 2026-09-01
 * Status: Active
 * UX-4 (аудит 2026-09-01): голе хвостове число без одиниці ≥ порога не
 * мерджиться мовчки в комору — `upsertItem` тримає його в
 * `ambiguousPantryItems`, доки людина не тапне «шт» чи «г». Раз обраний
 * вибір запамʼятовується per-продукт і вдруге не питає.
 *
 * Регресія: «Coca-Cola 2» (мала кількість) і «рис 2 кг» (явна одиниця,
 * включно зі злиттям дублікатів) мають лишитись без змін — це той самий
 * шлях `upsertItem`, який ЦЕЙ файл і захищає від тихого зламу.
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
import { __resetAmbiguousUnitMemoryForTests } from "../lib/pantryAmbiguousUnitMemory";

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
  __resetAmbiguousUnitMemoryForTests();
  vi.clearAllMocks();
});

describe("useNutritionPantries — UX-4 ambiguousQty", () => {
  it("does not merge a bare ≥100 count into the pantry — it waits in ambiguousPantryItems", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    act(() => result.current.upsertItem("Нутелла 350"));

    expect(result.current.pantryItems).toHaveLength(0);
    expect(result.current.ambiguousPantryItems).toHaveLength(1);
    expect(result.current.ambiguousPantryItems[0]).toMatchObject({
      name: "Нутелла",
      qty: 350,
      ambiguousQty: true,
    });
  });

  it("resolving 'г' writes the item with qty/unit = 350/г and clears the prompt", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    act(() => result.current.upsertItem("Нутелла 350"));
    act(() => result.current.resolveAmbiguousPantryItem(0, "г"));

    expect(result.current.ambiguousPantryItems).toHaveLength(0);
    expect(result.current.pantryItems).toHaveLength(1);
    expect(result.current.pantryItems[0]).toMatchObject({
      name: "Нутелла",
      qty: 350,
      unit: "г",
    });
  });

  it("resolving 'шт' writes the item with the parser's own default unit", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    act(() => result.current.upsertItem("Цукор 200"));
    act(() => result.current.resolveAmbiguousPantryItem(0, "шт"));

    expect(result.current.pantryItems[0]).toMatchObject({
      name: "Цукор",
      qty: 200,
      unit: "шт",
    });
  });

  it("dismissing the prompt drops the item — nothing is written to the pantry", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    act(() => result.current.upsertItem("Борошно 500"));
    act(() => result.current.dismissAmbiguousPantryItem(0));

    expect(result.current.ambiguousPantryItems).toHaveLength(0);
    expect(result.current.pantryItems).toHaveLength(0);
  });

  it("remembers an explicit choice — the same product never asks twice", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    act(() => result.current.upsertItem("Нутелла 350"));
    act(() => result.current.resolveAmbiguousPantryItem(0, "г"));

    // Друге додавання того самого продукту — питання більше немає, і
    // кількості накопичуються (та сама базова одиниця «г»).
    act(() => result.current.upsertItem("Нутелла 150"));

    expect(result.current.ambiguousPantryItems).toHaveLength(0);
    expect(result.current.pantryItems).toHaveLength(1);
    expect(result.current.pantryItems[0]).toMatchObject({
      name: "Нутелла",
      qty: 500,
      unit: "г",
    });
  });

  it("memory is keyed per product — a different item still asks", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    act(() => result.current.upsertItem("Нутелла 350"));
    act(() => result.current.resolveAmbiguousPantryItem(0, "г"));
    act(() => result.current.upsertItem("Цукор 200"));

    expect(result.current.ambiguousPantryItems).toHaveLength(1);
    expect(result.current.ambiguousPantryItems[0]?.name).toBe("Цукор");
  });

  // ── Регресія: живе репро з edge/Q4 (findings.md UX-4) ─────────────────
  it("regression: «Coca-Cola 2» stays a plain count — no prompt", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    act(() => result.current.upsertItem("Coca-Cola 2"));

    expect(result.current.ambiguousPantryItems).toHaveLength(0);
    expect(result.current.pantryItems[0]).toMatchObject({
      name: "Coca-Cola",
      qty: 2,
      unit: "шт",
    });
  });

  it("regression: «рис 2 кг» + a repeat merge into 4 кг — no prompt", () => {
    seed([{ id: "home", name: "Дім", items: [], text: "" }], "home");
    const { result } = renderHarness();

    act(() => result.current.upsertItem("рис 2 кг"));
    act(() => result.current.upsertItem("рис 2 кг"));

    expect(result.current.ambiguousPantryItems).toHaveLength(0);
    expect(result.current.pantryItems).toHaveLength(1);
    expect(result.current.pantryItems[0]).toMatchObject({
      qty: 4,
      unit: "кг",
    });
  });
});
