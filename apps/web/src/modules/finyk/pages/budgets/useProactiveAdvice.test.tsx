// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    chatApi: { send: vi.fn(async () => ({ text: "AI порада" })) },
  };
});

import { useProactiveAdvice } from "./useProactiveAdvice";
import { saveProactiveAdviceToLS } from "./budgetsLib";
import type { LimitBudget } from "@sergeant/finyk-domain/domain/types";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const NOW = new Date(2026, 5, 15, 12, 0, 0); // 2026-06-15

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("useProactiveAdvice", () => {
  it("returns no items when there are no limit budgets", () => {
    const { result } = renderHook(
      () =>
        useProactiveAdvice({
          limitBudgets: [],
          calcSpent: () => 0,
          customCategories: [],
          now: NOW,
        }),
      { wrapper },
    );
    expect(result.current.proactiveItems).toEqual([]);
  });

  it("skips budgets below the 80% threshold", () => {
    const budget = {
      id: "b1",
      type: "limit",
      categoryId: "food",
      limit: 1000,
    } as unknown as LimitBudget;
    const { result } = renderHook(
      () =>
        useProactiveAdvice({
          limitBudgets: [budget],
          calcSpent: () => 100, // 10% — not at risk
          customCategories: [],
          now: NOW,
        }),
      { wrapper },
    );
    expect(result.current.proactiveItems).toEqual([]);
  });

  it("creates an at-risk item and seeds cached advice from LS without a fetch", async () => {
    const budget = {
      id: "b1",
      type: "limit",
      categoryId: "food",
      limit: 1000,
    } as unknown as LimitBudget;
    // Pre-seed the LS cache for the current Kyiv month key.
    saveProactiveAdviceToLS("food", "2026-06", "кешована порада");

    const { result } = renderHook(
      () =>
        useProactiveAdvice({
          limitBudgets: [budget],
          calcSpent: () => 900, // 90% → at risk
          customCategories: [],
          now: NOW,
        }),
      { wrapper },
    );

    expect(result.current.proactiveItems).toHaveLength(1);
    const item = result.current.proactiveItems[0]!;
    expect(item.categoryId).toBe("food");
    expect(item.pct).toBe(90);
    expect(item.remaining).toBe(100);

    await waitFor(() => {
      expect(result.current.proactiveAdvice["food"]).toBe("кешована порада");
    });
  });
});
