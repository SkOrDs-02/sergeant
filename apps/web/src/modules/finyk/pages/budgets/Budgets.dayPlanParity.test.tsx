// @vitest-environment jsdom
/**
 * logic-44 (аудит 2026-10-01, рішення власника 2026-11-21): денна норма
 * одна на модуль. Планування («N ₴/день · N дн.») і Огляд («Лишилось на
 * сьогодні», `dayBudget`) на тих самих даних мусять показувати одне число
 * з тією самою кількістю днів — формула ADR-0079: регулярні потоки
 * зарезервовані, сьогодні входить у решту днів.
 *
 * Сценарій з аудиту: 2 жовтня, план витрат 31 000 ₴, сьогодні витрачено
 * 555 ₴. Плюс оренда 3 000 ₴ 25-го, щоб стара формула без регулярних
 * потоків (`getMonthlyPlanUsage.safePerDay`) не могла випадково збігтися.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, fireEvent, screen } from "@testing-library/react";
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
import { useOverviewData } from "../overview/useOverviewData";
import type { UseOverviewDataParams } from "../overview/useOverviewData";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

// 2 жовтня 2026, 12:00 за Києвом.
const NOW = new Date("2026-10-02T09:00:00Z");

const todayTx = {
  id: "today-coffee",
  amount: -55_500,
  time: Math.floor(NOW.getTime() / 1000) - 600,
  description: "Кава",
  mcc: 5814,
} as unknown as Transaction;

const monthlyPlan = { income: 40_000, expense: 31_000, savings: 0 };
const subscriptions = [
  {
    id: "rent",
    name: "Оренда",
    keyword: "",
    currency: "UAH",
    billingDay: 25,
    expectedAmount: 300_000,
  },
];

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

function overviewDayBudget(): number | null {
  const { result } = renderHook(() =>
    useOverviewData({
      mono: {
        realTx: [todayTx],
        loadingTx: false,
        clientInfo: null,
        accounts: [],
        transactions: [todayTx],
        syncState: "idle",
        lastUpdated: null,
        error: null,
        refresh: vi.fn(),
        privatTotal: 0,
      } as unknown as UseOverviewDataParams["mono"],
      storage: {
        budgets: [],
        subscriptions,
        manualDebts: [],
        receivables: [],
        hiddenAccounts: [],
        excludedTxIds: new Set<string>(),
        monthlyPlan,
        networthHistory: [],
        saveNetworthSnapshot: vi.fn(),
        txCategories: {},
        txSplits: {},
        manualAssets: [],
        customCategories: [],
        manualExpenses: [],
      } as unknown as UseOverviewDataParams["storage"],
    }),
  );
  return result.current.dayBudget;
}

function planningText(): string {
  const mono: BudgetsMonoSlice = {
    realTx: [todayTx],
    loadingTx: false,
    transactions: [todayTx],
  };
  const storage = {
    budgets: [],
    setBudgets: vi.fn(),
    excludedTxIds: new Set<string>(),
    monthlyPlan,
    setMonthlyPlan: vi.fn(),
    txCategories: {},
    txSplits: {},
    customCategories: [],
    subscriptions,
    manualDebts: [],
    receivables: [],
  } as unknown as BudgetsStorageSlice;
  const { container } = render(
    <Providers>
      <Budgets mono={mono} storage={storage} />
    </Providers>,
  );
  fireEvent.click(screen.getByRole("button", { name: /План на місяць/ }));
  return (container.textContent ?? "").replace(/\s/g, "");
}

describe("Денна норма: Планування = Огляд (logic-44)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("показує ту саму норму і ті самі дні, що й Огляд", () => {
    const dayBudget = overviewDayBudget();
    // ADR-0079: (31 000 − 0 до сьогодні − 3 000 оренди) / 30 днів разом
    // із сьогодні.
    expect(dayBudget).toBeCloseTo((31_000 - 3_000) / 30);

    const text = planningText();
    expect(text).toContain("933₴/день·30дн.");
    // Стара формула Планування: (31 000 − 555) / 29 = 1 049 ₴ · 29 дн.
    expect(text).not.toContain("29дн.");
    expect(text).not.toContain("1049₴/день");
  });
});
