// @vitest-environment jsdom
/**
 * Ліміти Планування × глибина історії (аудит 2026-10-01, logic-07).
 *
 * `mono.realTx` після відповіді мережі тримає лише поточний київський місяць,
 * тож тижневий ліміт у перші дні місяця недораховував витрати з минулого
 * місяця. Планування добирає їх з SQLite-дзеркала (`useBankHistoryTx`).
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
import type { Budget, Transaction } from "@sergeant/finyk-domain/domain/types";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "../../lib/monoMirrorReader";
import { Budgets } from "./Budgets";

// Чт 01.10.2026, тиждень з пн 28.09.
const NOW = new Date("2026-10-01T09:00:00Z");

function mkTx(id: string, amountUah: number, iso: string): Transaction {
  return {
    id,
    amount: -amountUah * 100,
    time: Math.floor(new Date(iso).getTime() / 1000),
    date: iso.slice(0, 10),
    description: "",
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

const WEEKLY_LIMIT = {
  id: "b-week",
  type: "limit",
  categoryId: "transport",
  limit: 1000,
  period: "week",
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

function renderBudgets(): void {
  render(
    <Providers>
      <Budgets
        mono={{
          // Мережа: лише жовтень.
          realTx: [mkTx("o1", 200, "2026-10-01T08:00:00+03:00")],
          loadingTx: false,
          transactions: [],
        }}
        storage={{
          budgets: [WEEKLY_LIMIT],
          setBudgets: vi.fn(),
          excludedTxIds: new Set<string>(),
          monthlyPlan: { income: 30000, expense: 20000, savings: 5000 },
          setMonthlyPlan: vi.fn(),
          txCategories: {
            s1: "transport",
            s2: "transport",
            s3: "transport",
            o1: "transport",
          },
          txSplits: {},
          customCategories: [],
          subscriptions: [],
          manualDebts: [],
          receivables: [],
        }}
      />
    </Providers>,
  );
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: /Ліміти/i }));
  });
}

function limitCardText(): string {
  const heading = screen.getAllByText(/Транспорт/)[0]!;
  const card = heading.closest("div[class*='rounded']") ?? heading;
  return (card.parentElement?.textContent ?? card.textContent ?? "").replace(
    /\s/g,
    "",
  );
}

describe("Планування: тижневий ліміт на межі місяців", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    clearFinykMonoMirrorCache();
    vi.useRealTimers();
  });

  it("дзеркало з 1650 ₴ за 28-30.09 + 200 ₴ жовтня з мережі: 1850 ₴ і перевищення", () => {
    __setFinykMonoMirrorCacheForTests({
      transactions: [
        mkTx("s1", 1000, "2026-09-28T10:00:00+03:00"),
        mkTx("s2", 400, "2026-09-29T10:00:00+03:00"),
        mkTx("s3", 250, "2026-09-30T10:00:00+03:00"),
        mkTx("o1", 200, "2026-10-01T08:00:00+03:00"),
      ],
    });
    renderBudgets();
    const text = limitCardText();
    expect(text).toContain("1850");
    expect(text).toMatch(/185%|перевищ/i);
  });

  it("без дзеркала лишається лише мережевий жовтень (200 ₴)", () => {
    renderBudgets();
    const text = limitCardText();
    expect(text).toContain("200");
    expect(text).not.toContain("1850");
  });
});
