// @vitest-environment jsdom
/**
 * Coverage tests for the Budgets page shell.
 *
 * Budgets composes MonthlyPlanCard + Limits/Goals sections + AddBudgetForm and
 * pulls proactive AI advice via useProactiveAdvice (React Query). We mock
 * @shared/api's chatApi so no network is hit, wrap with QueryClient + Toast
 * providers, and feed plain mono/storage slices. Tests exercise: the loading
 * skeleton, the loaded layout, opening the add-budget form, adding a limit
 * budget (crypto.randomUUID + analytics), and the deep-link focus path that
 * auto-opens the limits section.
 *
 * Money is integer kopiykas (number); time pinned to Europe/Kyiv mid-June.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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

import { ToastProvider } from "@shared/hooks/useToast";
import { Budgets } from "./Budgets";
import type { BudgetsMonoSlice, BudgetsStorageSlice } from "./Budgets";
import type { Budget, Transaction } from "@sergeant/finyk-domain/domain/types";

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

describe("Budgets page", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(KYIV);
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the loading skeleton when loadingTx and no realTx", () => {
    const { container } = render(
      <Providers>
        <Budgets
          mono={buildMono({ loadingTx: true, realTx: [] })}
          storage={buildStorage()}
        />
      </Providers>,
    );
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("renders the loaded page with the add-limit/goal CTA", () => {
    renderBudgets();
    // CTA button to open the add-budget form
    expect(
      screen.getByRole("button", { name: /Додати ліміт або ціль/ }),
    ).toBeInTheDocument();
  });

  it("opens the add-budget form on CTA click", () => {
    renderBudgets();
    const cta = screen.getByRole("button", { name: /Додати ліміт або ціль/ });
    act(() => {
      fireEvent.click(cta);
    });
    // form select for category appears
    expect(screen.getByDisplayValue("Обери категорію")).toBeInTheDocument();
  });

  it("renders existing limit budgets in the section", () => {
    const budgets: Budget[] = [
      {
        id: "b1",
        type: "limit",
        categoryId: "food",
        limit: 5000,
      } as unknown as Budget,
    ];
    renderBudgets({ storage: buildStorage({ budgets }) });
    // limits section header renders ("Ліміти · <month>")
    expect(screen.getByText(/Ліміти/)).toBeInTheDocument();
  });

  it("adds a limit budget via the form submit", async () => {
    const setBudgets = vi.fn();
    renderBudgets({ storage: buildStorage({ setBudgets }) });
    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: /Додати ліміт або ціль/ }),
      );
    });
    // pick category
    fireEvent.change(screen.getByDisplayValue("Обери категорію"), {
      target: { value: "food" },
    });
    // amount field (labelled "Ліміт")
    fireEvent.change(screen.getByLabelText("Ліміт"), {
      target: { value: "3000" },
    });
    // submit the new-limit form
    await act(async () => {
      fireEvent.submit(
        screen.getByRole("form", { name: "Новий ліміт бюджету" }),
      );
    });
    // setBudgets is the updater; called when a valid draft is submitted
    expect(setBudgets).toHaveBeenCalled();
  });

  it("auto-opens the limits section for a deep-linked focus category", () => {
    const budgets: Budget[] = [
      {
        id: "b1",
        type: "limit",
        categoryId: "food",
        limit: 5000,
      } as unknown as Budget,
    ];
    act(() => {
      renderBudgets({
        storage: buildStorage({ budgets }),
        focusLimitCategoryId: "food",
      });
    });
    // persisted limits-open flag is set true by the focus effect
    expect(localStorage.getItem("finyk_budgets_limits_open_v1")).toBe("true");
  });

  it("renders with realTx data (no skeleton) and stat-based spend", () => {
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
        <Budgets mono={buildMono({ realTx })} storage={buildStorage()} />
      </Providers>,
    );
    expect(
      container.querySelector('[aria-busy="true"]'),
    ).not.toBeInTheDocument();
  });
});
