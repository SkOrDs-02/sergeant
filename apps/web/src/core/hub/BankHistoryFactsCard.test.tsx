/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { finykKeys } from "@shared/lib/api/queryKeys";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@sergeant/shared";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import {
  BankHistoryFactsCard,
  formatBankHistoryFacts,
} from "./BankHistoryFactsCard";

const state = vi.hoisted(() => ({
  mirror: [] as unknown[],
  stat: [] as unknown[],
  hidden: false,
}));

vi.mock("../../modules/finyk/hooks/useFinykStatTransactions", () => ({
  useFinykMirrorTransactions: () => state.mirror,
  useFinykStatTransactions: () => ({
    statTransactions: state.stat,
    slots: { txCategories: {}, txSplits: {}, customCategories: [] },
  }),
}));

vi.mock("../../modules/finyk/lib/balanceVisibility", () => ({
  isFinykBalanceHidden: () => state.hidden,
  maskAmount: (text: string, hidden: boolean) => (hidden ? "•••" : text),
}));

let queryClient: QueryClient;

// Картка підписана на кеш стану синку Monobank, тож рендер іде з провайдером.
function render(ui: ReactElement) {
  return rtlRender(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function tx(id: string, amount: number, day: string, description: string) {
  return {
    id,
    amount,
    time: Math.floor(Date.parse(`${day}T10:00:00Z`) / 1000),
    description,
    mcc: 5411,
  } as unknown as Transaction;
}

describe("BankHistoryFactsCard", () => {
  beforeEach(() => {
    localStorage.clear();
    queryClient = new QueryClient();
    state.hidden = false;
    const txs = [
      tx("a", -12_000, "2026-11-10", "АТБ"),
      tx("b", -250_000, "2026-11-12", "Rozetka"),
    ];
    state.mirror = txs;
    state.stat = txs;
    // Monobank підключено щойно: вікно першого тижня від підключення (В-2).
    localStorage.setItem(
      STORAGE_KEYS.FINYK_MONO_FIRST_CONNECTED_AT,
      JSON.stringify(Date.now()),
    );
  });
  afterEach(() => cleanup());

  it("підключення понад тиждень тому або невідоме: картки немає", () => {
    localStorage.setItem(
      STORAGE_KEYS.FINYK_MONO_FIRST_CONNECTED_AT,
      JSON.stringify(Date.now() - 9 * 86_400_000),
    );
    const { unmount } = render(<BankHistoryFactsCard enabled />);
    expect(screen.queryByTestId("bank-history-facts")).toBeNull();
    unmount();
    localStorage.removeItem(STORAGE_KEYS.FINYK_MONO_FIRST_CONNECTED_AT);
    render(<BankHistoryFactsCard enabled />);
    expect(screen.queryByTestId("bank-history-facts")).toBeNull();
  });

  it("з історією банку показує факти; «Зрозуміло» ховає назавжди", () => {
    const { unmount } = render(<BankHistoryFactsCard enabled />);
    expect(screen.getByText("Що видно з історії банку")).toBeTruthy();
    expect(screen.getByText(/Найбільша категорія:/)).toBeTruthy();
    expect(
      screen.getByText(/Найбільша разова операція: .*Rozetka/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Зрозуміло" }));
    expect(screen.queryByTestId("bank-history-facts")).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.HUB_BANK_FACTS_SEEN)).toBe("1");

    unmount();
    render(<BankHistoryFactsCard enabled />);
    expect(screen.queryByTestId("bank-history-facts")).toBeNull();
  });

  it("зʼявляється, щойно в кеш стану синку приходить серверна дата підключення", async () => {
    localStorage.removeItem(STORAGE_KEYS.FINYK_MONO_FIRST_CONNECTED_AT);
    render(<BankHistoryFactsCard enabled />);
    expect(screen.queryByTestId("bank-history-facts")).toBeNull();

    await act(async () => {
      queryClient.setQueryData(finykKeys.monoSyncState, {
        status: "active",
        connectedAt: new Date().toISOString(),
      });
    });
    expect(await screen.findByTestId("bank-history-facts")).toBeTruthy();
  });

  it("сервер каже «не підключено» (null): локальна мітка не тримає картку", async () => {
    render(<BankHistoryFactsCard enabled />);
    expect(screen.getByTestId("bank-history-facts")).toBeTruthy();
    await act(async () => {
      queryClient.setQueryData(finykKeys.monoSyncState, {
        status: "disconnected",
        connectedAt: null,
      });
    });
    await waitFor(() =>
      expect(screen.queryByTestId("bank-history-facts")).toBeNull(),
    );
  });

  it("без дзеркала Monobank (лише ручні записи) картки немає", () => {
    state.mirror = [];
    render(<BankHistoryFactsCard enabled />);
    expect(screen.queryByTestId("bank-history-facts")).toBeNull();
  });

  it("поза першим тижнем (enabled = false) картки немає", () => {
    render(<BankHistoryFactsCard enabled={false} />);
    expect(screen.queryByTestId("bank-history-facts")).toBeNull();
  });
});

describe("formatBankHistoryFacts", () => {
  it("маскує суми, коли баланс приховано", () => {
    const lines = formatBankHistoryFacts(
      {
        topCategory: { label: "Продукти", spent: 1200, pct: 40 },
        recurring: {
          count: 2,
          biggestName: "Оренда",
          biggestAmount: 12000,
          currency: "UAH",
        },
        third: { kind: "weekday", mondayIndex: 5, avgMinor: 100_000 },
      },
      true,
    );
    expect(lines).toHaveLength(3);
    expect(lines.join(" ")).not.toMatch(/\d\s?₴/);
    expect(lines[2]).toContain("субота");
  });
});
