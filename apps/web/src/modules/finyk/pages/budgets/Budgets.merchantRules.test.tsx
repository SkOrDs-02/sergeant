// @vitest-environment jsdom
/**
 * Ліміти × правила «Завжди так для цього магазину» (рішення власника
 * 2026-10-01): ліміт рахує витрати тією ж категорією, яку малює список
 * операцій, тож правило мерчанта впливає й на «витрачено» по ліміту, а явний
 * override операції лишається сильнішим.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
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
import { buildMerchantRuleIndex } from "@sergeant/finyk-domain/lib/merchantRules";
import type { Budget, Transaction } from "@sergeant/finyk-domain/domain/types";
import { Budgets } from "./Budgets";
import type { BudgetsStorageSlice } from "./Budgets";

const KYIV = new Date("2026-06-15T09:00:00Z");

const RULES = buildMerchantRuleIndex([
  {
    id: "mr_1",
    kind: "expense",
    merchantKey: "сільпо",
    categoryId: "transport",
    label: "Сільпо",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
  },
]);

function mkTx(id: string, description: string, amount: number): Transaction {
  return {
    id,
    amount,
    time: Math.floor(new Date("2026-06-10T12:00:00+03:00").getTime() / 1000),
    date: "2026-06-10",
    description,
    mcc: 0,
    categoryId: "other",
    type: "expense",
    source: "mono",
    accountId: "mono-1",
    manual: false,
    _source: "mono",
    _accountId: "mono-1",
    _manual: false,
  };
}

const LIMIT = {
  id: "b1",
  type: "limit",
  categoryId: "transport",
  limit: 5000,
} as unknown as Budget;

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

function renderBudgets(storage: Partial<BudgetsStorageSlice>) {
  render(
    <Providers>
      <Budgets
        mono={{
          realTx: [
            mkTx("t1", "Сільпо №5", -120000),
            mkTx("t2", "СІЛЬПО 12", -80000),
            mkTx("t3", "АТБ", -50000),
          ],
          loadingTx: false,
          transactions: [],
        }}
        storage={{
          budgets: [LIMIT],
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
          ...storage,
        }}
      />
    </Providers>,
  );
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: /Ліміти/i }));
  });
}

/** Текст картки ліміту «Транспорт» без пробілів, щоб не залежати від NBSP. */
function limitCardText(): string {
  const heading = screen.getAllByText(/Транспорт/)[0]!;
  const card = heading.closest("div[class*='rounded']") ?? heading;
  return (card.parentElement?.textContent ?? card.textContent ?? "").replace(
    /\s/g,
    "",
  );
}

describe("Ліміти × правила мерчантів", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(KYIV);
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("без правил витрати Сільпо не потрапляють у ліміт «Транспорт»", () => {
    renderBudgets({});
    expect(limitCardText()).not.toContain("2000");
  });

  it("з правилом обидві операції Сільпо (1200 + 800 ₴) рахуються в ліміті «Транспорт»", () => {
    renderBudgets({ merchantRuleIndex: RULES });
    expect(limitCardText()).toContain("2000");
  });

  it("явний override однієї операції сильніший: її 800 ₴ у ліміт не йдуть", () => {
    renderBudgets({
      merchantRuleIndex: RULES,
      txCategories: { t2: "food" },
    });
    const text = limitCardText();
    expect(text).toContain("1200");
    expect(text).not.toContain("2000");
  });
});
