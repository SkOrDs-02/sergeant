// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const cachedState = { transactions: [] as unknown[] };

vi.mock("../lib/monoMirrorReader", () => ({
  getCachedFinykMonoMirrorState: () => cachedState,
  getVisibleFinykMonoMirrorState: () => cachedState,
}));
vi.mock("../lib/monoMirrorGate", () => ({
  useFinykMonoMirrorTick: () => 0,
}));

const slotsValue = {
  budgets: [] as unknown[],
  txCategories: {} as Record<string, string>,
  txSplits: {},
  customCategories: [] as unknown[],
  subscriptions: [] as unknown[],
  dismissedRecurring: [] as string[],
  excludedStatTxIds: [] as string[],
  manualExpenses: [] as unknown[],
};
vi.mock("./useFinykStorageSlots", () => ({
  useFinykStorageSlots: () => slotsValue,
}));

import { useFinykInsights } from "./useFinykInsights";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
  cachedState.transactions = [];
  slotsValue.excludedStatTxIds = [];
  slotsValue.manualExpenses = [];
  slotsValue.budgets = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useFinykInsights", () => {
  it("returns an empty array when no insight triggers fire", () => {
    const { result } = renderHook(() => useFinykInsights());
    expect(result.current).toEqual([]);
  });

  it("surfaces the coffee-limit insight when MoM growth crosses the threshold", () => {
    const tx = (id: string, dateMs: number) =>
      ({
        id,
        time: Math.floor(dateMs / 1000),
        date: new Date(dateMs).toISOString().slice(0, 10),
        amount: -20000,
        description: "café",
        mcc: 5812,
      }) as unknown;
    cachedState.transactions = [
      tx("a", new Date(2026, 5, 5).getTime()),
      {
        ...(tx("b", new Date(2026, 4, 5).getTime()) as object),
        amount: -10000,
      },
    ];
    slotsValue.txCategories = { a: "restaurant", b: "restaurant" };

    const { result } = renderHook(() => useFinykInsights());
    expect(result.current.length).toBeGreaterThanOrEqual(1);
    expect(result.current.some((i) => i.id.includes("coffee"))).toBe(true);

    slotsValue.txCategories = {};
  });

  it("does not build insights from transactions excluded from statistics", () => {
    const tx = (id: string, dateMs: number, amount: number) =>
      ({
        id,
        time: Math.floor(dateMs / 1000),
        date: new Date(dateMs).toISOString().slice(0, 10),
        amount,
        description: "café",
        mcc: 5812,
      }) as unknown;
    cachedState.transactions = [
      tx("excluded", new Date(2026, 5, 5).getTime(), -20000),
      tx("previous", new Date(2026, 4, 5).getTime(), -10000),
    ];
    slotsValue.txCategories = {
      excluded: "restaurant",
      previous: "restaurant",
    };
    slotsValue.excludedStatTxIds = ["excluded"];

    const { result } = renderHook(() => useFinykInsights());
    expect(result.current.some((i) => i.id.includes("coffee"))).toBe(false);

    slotsValue.txCategories = {};
  });

  // Регресія (браузерна перевірка 2026-08-31): дзеркало Mono несе лише банк,
  // а готівкова витрата живе в storage-слотах. До фікса на одному екрані
  // картка ліміту казала «перевищено», а інсайт тих самих грошей не бачив.
  it("бачить перевищення ліміту, зроблене ручною готівковою витратою", () => {
    slotsValue.budgets = [
      {
        id: "b1",
        type: "limit",
        period: "month",
        categoryId: "food",
        limit: 3000,
      },
    ];
    slotsValue.manualExpenses = [
      {
        id: "cash-1",
        amount: 4200,
        kind: "expense",
        category: "food",
        date: "2026-06-15",
        description: "Тижневі продукти",
      },
    ];

    const { result } = renderHook(() => useFinykInsights());

    const overrun = result.current.find((i) =>
      i.id.startsWith("finyk-budget-overrun"),
    );
    expect(overrun).toBeDefined();
    expect(overrun?.title).toContain("140%");
    // Префіл чипа «AI» бере ті самі числа, що й заголовок. Роздільник
    // розрядів у `formatNumberUk` - нерозривний пробіл, не звичайний.
    expect(overrun?.askAiPrompt).toMatch(
      /4\u00a0200 грн із бюджету 3\u00a0000 грн/,
    );
  });
});
