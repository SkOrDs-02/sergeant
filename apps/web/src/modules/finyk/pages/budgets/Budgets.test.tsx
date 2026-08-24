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

  // Regression (CodeRabbit review on #551): the Kyiv-month clamp added for the
  // plan-vs-fact card must NOT reach limit budgets. `LimitBudget.period` is
  // `month | week | one_time`, and `filterTransactionsForLimitPeriod` applies
  // its own window — a `week` budget viewed early in a month starts on a Monday
  // that belongs to the previous month, so pre-clamping silently understated
  // spend against the limit.
  it("counts previous-month spend inside a week-period limit window", () => {
    // 2026-07-01 is a Wednesday → the Kyiv week started Monday 2026-06-29.
    vi.setSystemTime(new Date("2026-07-01T09:00:00Z"));
    const tx: Transaction = {
      id: "t1",
      // 2026-06-30 — previous calendar month, but inside the current week.
      time: Math.floor(Date.UTC(2026, 5, 30, 9, 0, 0) / 1000),
      amount: -50_000,
      description: "Сільпо",
      mcc: 0,
    } as unknown as Transaction;
    const budgets: Budget[] = [
      {
        id: "b1",
        type: "limit",
        categoryId: "food",
        limit: 1000,
        period: "week",
      } as unknown as Budget,
    ];

    act(() => {
      renderBudgets({
        mono: buildMono({ realTx: [tx] }),
        storage: buildStorage({ budgets, txCategories: { t1: "food" } }),
        // The limits section is collapsed by default; the deep-link focus
        // effect expands it so the card actually renders.
        focusLimitCategoryId: "food",
      });
    });

    // 500 ₴ from 30 червня counts against the current week's 1000 ₴ limit.
    expect(screen.getByText(/500\s*\/\s*1000/)).toBeInTheDocument();
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

  it("manual income (kind: income) this month moves factIncome / Plan card progress (fab-and-manual-income spec)", () => {
    // `mono.realTx` deliberately stays empty — Budgets previously read spend
    // ONLY from the bank tx stream, ignoring `storage.manualExpenses`
    // entirely (a pre-existing gap independent of this feature). The merge
    // added alongside manual-income must pick this record up so the Plan
    // card's "Дохід" fact actually moves when a manual salary is logged.
    const manualExpenses = [
      {
        id: "salary-1",
        date: "2026-06-10T12:00:00.000Z",
        description: "Зарплата",
        amount: 4321,
        category: "salary",
        kind: "income" as const,
      },
    ];
    const { container } = renderBudgets({
      storage: buildStorage({ manualExpenses }),
    });
    // The Plan/Fact table (with the "Дохід" row) only renders once the
    // collapsed "Фінплан на місяць" card is expanded.
    fireEvent.click(screen.getByRole("button", { name: /Фінплан на місяць/ }));
    // `\s` already covers U+00A0 (non-breaking space) per the JS spec.
    const flatText = (container.textContent ?? "").replace(/\s/g, "");
    expect(flatText).toContain("4321");
  });

  // Regression (browser QA 2026-08-23): a freshly created limit showed
  // «0 / 2000» while the same month already held matching spending. The
  // spend existed BEFORE the budget — hence the seeding order here — and the
  // mismatch came from two category dictionaries: the limit picker offers MCC
  // ids, the manual expense sheet writes manual-taxonomy slugs whose
  // `canonicalId` differs (`cafe → restaurant`, `groceries → food`).
  it("counts spending that predates the limit, including manual-only slugs", () => {
    const manualExpenses = [
      // Seeded first — the limit below is "created" after these exist.
      {
        id: "e1",
        date: "2026-06-05",
        description: "Сільпо",
        amount: 1600,
        category: "food",
      },
      {
        id: "e2",
        // Legacy alias of «Продукти» — same bucket, different slug.
        date: "2026-06-08",
        description: "АТБ",
        amount: 1000,
        category: "groceries",
      },
    ];
    const budgets: Budget[] = [
      {
        id: "b1",
        type: "limit",
        categoryId: "food",
        limit: 2000,
        period: "month",
        // Created "now", i.e. after every expense above.
        createdAt: KYIV.toISOString(),
      } as unknown as Budget,
    ];
    act(() => {
      renderBudgets({
        storage: buildStorage({ budgets, manualExpenses }),
        focusLimitCategoryId: "food",
      });
    });
    expect(screen.getByText(/2600\s*\/\s*2000/)).toBeInTheDocument();
  });

  it("counts a manual `cafe` expense against a «Кафе та ресторани» limit", () => {
    const manualExpenses = [
      {
        id: "e1",
        date: "2026-06-05",
        description: "Кава",
        amount: 850,
        category: "cafe",
      },
    ];
    const budgets: Budget[] = [
      {
        id: "b1",
        type: "limit",
        categoryId: "restaurant",
        limit: 1000,
        period: "month",
        createdAt: KYIV.toISOString(),
      } as unknown as Budget,
    ];
    act(() => {
      renderBudgets({
        storage: buildStorage({ budgets, manualExpenses }),
        focusLimitCategoryId: "restaurant",
      });
    });
    expect(screen.getByText(/850\s*\/\s*1000/)).toBeInTheDocument();
  });
});
