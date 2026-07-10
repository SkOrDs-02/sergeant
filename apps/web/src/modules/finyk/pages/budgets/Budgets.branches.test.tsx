// @vitest-environment jsdom
/**
 * Branch-focused coverage for Budgets page shell — first-run monthly-plan
 * hint dismiss, limits-section toggle/open branches, and goals toggle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Budget, Transaction } from "@sergeant/finyk-domain/domain/types";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    chatApi: { send: vi.fn(async () => ({ text: "AI порада" })) },
  };
});

import { ToastProvider } from "@shared/hooks/useToast";
import { Budgets } from "./Budgets";
import type { BudgetsMonoSlice, BudgetsStorageSlice } from "./Budgets";

const KYIV = new Date("2026-06-15T09:00:00Z");

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

function buildMono(
  overrides: Partial<BudgetsMonoSlice> = {},
): BudgetsMonoSlice {
  return {
    realTx: [],
    loadingTx: false,
    transactions: [],
    ...overrides,
  };
}

function buildStorage(
  overrides: Partial<BudgetsStorageSlice> = {},
): BudgetsStorageSlice {
  return {
    budgets: [],
    setBudgets: vi.fn(),
    excludedTxIds: new Set<string>(),
    monthlyPlan: { income: 30000, expense: 20000, savings: 5000 },
    setMonthlyPlan: vi.fn(),
    txCategories: {},
    txSplits: {},
    customCategories: [],
    subscriptions: [],
    manualDebts: [],
    receivables: [],
    ...overrides,
  };
}

function renderBudgets(props: Partial<Parameters<typeof Budgets>[0]> = {}) {
  return render(
    <Providers>
      <Budgets mono={buildMono()} storage={buildStorage()} {...props} />
    </Providers>,
  );
}

describe("Budgets page (branches)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(KYIV);
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows and dismisses the monthly-plan first-run hint banner", () => {
    const onDismiss = vi.fn();
    renderBudgets({
      monthlyPlanFirstRunHint: true,
      onDismissMonthlyPlanFirstRunHint: onDismiss,
    });
    expect(screen.getByTestId("first-run-hint-banner")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Зрозуміло" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not render first-run hint when monthlyPlanFirstRunHint=false", () => {
    renderBudgets({ monthlyPlanFirstRunHint: false });
    expect(screen.queryByTestId("first-run-hint-banner")).toBeNull();
  });

  it("toggles limits section open via localStorage-backed state", () => {
    renderBudgets();
    const limitsToggle = screen.getByRole("button", { name: /Ліміти/i });
    expect(limitsToggle).toHaveAttribute("aria-expanded", "false");
    act(() => {
      fireEvent.click(limitsToggle);
    });
    expect(limitsToggle).toHaveAttribute("aria-expanded", "true");
    expect(localStorage.getItem("finyk_budgets_limits_open_v1")).toBe("true");
  });

  it("shows limits empty state after opening the section", () => {
    renderBudgets();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Ліміти/i }));
    });
    expect(screen.getByText("Поки немає лімітів")).toBeInTheDocument();
  });

  it("renders limit cards when section is open and budgets exist", () => {
    const budgets: Budget[] = [
      {
        id: "b1",
        type: "limit",
        categoryId: "food",
        limit: 5000,
      } as unknown as Budget,
    ];
    renderBudgets({
      storage: buildStorage({ budgets }),
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Ліміти/i }));
    });
    expect(screen.getByText(/Продукти/)).toBeInTheDocument();
  });

  it("toggles goals section independently from limits", () => {
    renderBudgets();
    const goalsToggle = screen.getByRole("button", {
      name: /Цілі накопичення/i,
    });
    expect(goalsToggle).toHaveAttribute("aria-expanded", "false");
    act(() => {
      fireEvent.click(goalsToggle);
    });
    expect(goalsToggle).toHaveAttribute("aria-expanded", "true");
    expect(localStorage.getItem("finyk_budgets_goals_open_v1")).toBe("true");
  });

  it("keeps rendering loaded data while background refetch is in flight", () => {
    const realTx = [
      {
        id: "t1",
        amount: -10000,
        time: Math.floor(KYIV.getTime() / 1000),
        categoryId: "food",
        mcc: 5411,
        description: "Сільпо",
      } as unknown as Transaction,
    ];
    const { container } = render(
      <Providers>
        <Budgets
          mono={buildMono({ realTx, loadingTx: true })}
          storage={buildStorage()}
        />
      </Providers>,
    );
    expect(
      container.querySelector('[aria-busy="true"]'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Додати ліміт або ціль/ }),
    ).toBeInTheDocument();
  });
});
