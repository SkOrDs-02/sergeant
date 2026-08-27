// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

// The transaction-details sheet renders a "Чек" section
// (`SilpoReceiptSection`) that reads `useSilpoSyncState` via
// `@tanstack/react-query` — mock the API so this suite (which predates the
// Silpo experiment and has no `QueryClientProvider`-independent stubbing
// story) doesn't hit a real, unmocked `httpClient` fetch. Status stays
// "disconnected", so the section renders nothing and every existing
// assertion here is unaffected.
vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    silpoApi: {
      syncState: vi.fn().mockResolvedValue({
        status: "disconnected",
        accessTokenExpiresAt: null,
        lastSyncAt: null,
        receiptsCount: 0,
      }),
      sync: vi.fn(),
      disconnect: vi.fn(),
      wipe: vi.fn(),
      receipts: vi.fn(),
      receiptDetail: vi.fn(),
    },
  };
});

const { mockRequestCloudPull, mockMonoRefresh, mockToast } = vi.hoisted(() => ({
  mockRequestCloudPull: vi.fn(() => Promise.resolve()),
  mockMonoRefresh: vi.fn(() => Promise.resolve()),
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@shared/components/ui/VirtualList", () => ({
  VirtualList: ({
    items,
    children,
  }: {
    items: unknown[];
    children: (item: unknown, index: number) => React.ReactNode;
  }) => (
    <div data-testid="virtual-list">
      {items.map((item, i) => (
        <div key={i}>{children(item, i)}</div>
      ))}
    </div>
  ),
}));

vi.mock("@shared/lib/modules/cloudPullRequest", () => ({
  requestCloudPull: mockRequestCloudPull,
}));

vi.mock("@shared/hooks/useCloudPullPending", () => ({
  useCloudPullPending: vi.fn(() => false),
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: vi.fn(() => mockToast),
}));

vi.mock("@shared/components/ui/PullToRefresh", () => ({
  PullToRefresh: ({
    children,
    onRefresh,
  }: {
    children: React.ReactNode;
    onRefresh?: () => Promise<void> | void;
  }) => (
    <div data-testid="pull-to-refresh">
      <button
        type="button"
        data-testid="trigger-refresh"
        onClick={() => void onRefresh?.()}
      >
        Оновити
      </button>
      {children}
    </div>
  ),
}));

import { Transactions } from "./Transactions";
import type {
  TransactionsMonoSlice,
  TransactionsStorageSlice,
} from "./Transactions";
import { requestCloudPull } from "@shared/lib/modules/cloudPullRequest";
import { safeReadLS } from "@shared/lib/storage/storage";
import {
  FINYK_TRANSFER_SUGGESTION_REJECTED_KEY,
  FINYK_TRANSFER_SUGGESTION_SNOOZED_KEY,
} from "@sergeant/finyk-domain/storage-keys";

const KYIV = new Date("2026-06-15T09:00:00Z");

function mkJuneTx(
  id: string,
  amount: number,
  opts: { time?: number } = {},
): Transaction {
  const time =
    opts.time ??
    Math.floor(new Date("2026-06-04T12:00:00+03:00").getTime() / 1000);
  return {
    id,
    amount,
    time,
    date: "2026-06-04",
    description: "Сільпо",
    mcc: 0,
    categoryId: "other",
    type: amount > 0 ? "income" : "expense",
    source: "mono",
    accountId: "mono-1",
    manual: false,
    _source: "mono",
    _accountId: "mono-1",
    _manual: false,
  };
}

const SAMPLE_TX = mkJuneTx("tx-1", -250);

function buildMono(
  overrides: Partial<TransactionsMonoSlice> = {},
): TransactionsMonoSlice {
  return {
    realTx: [],
    loadingTx: false,
    lastUpdated: null,
    syncState: { status: "idle" },
    accounts: [],
    fetchMonth: vi.fn(() => Promise.resolve()),
    historyTx: [],
    loadingHistory: false,
    refresh: mockMonoRefresh,
    ...overrides,
  };
}

function buildStorage(
  overrides: Partial<TransactionsStorageSlice> = {},
): TransactionsStorageSlice {
  return {
    hiddenTxIds: [],
    hideTx: vi.fn(),
    excludedTxIds: new Set<string>(),
    excludedStatTxIds: [],
    toggleExcludeFromStats: vi.fn(),
    txCategories: {},
    customCategories: [],
    overrideCategory: vi.fn(),
    txSplits: {},
    setSplitTx: vi.fn(),
    txNotes: {},
    setTxNote: vi.fn(),
    manualExpenses: [],
    addManualExpense: vi.fn(),
    removeManualExpense: vi.fn(),
    ...overrides,
  };
}

function renderTransactions(
  overrides: {
    mono?: Partial<TransactionsMonoSlice>;
    storage?: Partial<TransactionsStorageSlice>;
  } & Omit<
    Partial<Parameters<typeof Transactions>[0]>,
    "mono" | "storage"
  > = {},
) {
  const { mono, storage, ...rest } = overrides;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    // Деталі транзакції відкривають `SilpoReceiptSection`, а той ходить у
    // `useNavigate` (CTA «Звʼязати Сільпо») — хук кидає без роутер-контексту.
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <Transactions
          mono={buildMono(mono)}
          storage={buildStorage(storage)}
          {...rest}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("Transactions page shell", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(KYIV);
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders the header month label for the current Kyiv month", () => {
    renderTransactions();
    expect(screen.getByText(/червень 2026/i)).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Керування операціями" }),
    ).toBeInTheDocument();
  });

  it("renders the sync pill when sync status is non-idle", () => {
    renderTransactions({
      mono: buildMono({
        syncState: {
          status: "success",
          source: "network",
          accountsOk: 2,
          accountsTotal: 2,
        },
      }),
    });
    expect(screen.getByText("синхронізовано")).toBeInTheDocument();
  });

  it("renders the transaction filter toolbar", () => {
    renderTransactions();
    expect(
      screen.getByRole("toolbar", { name: "Фільтр транзакцій" }),
    ).toBeInTheDocument();
  });

  it("shows and clears the URL-driven today filter", () => {
    const onClearDayFilter = vi.fn();
    renderTransactions({ dayFilter: "today", onClearDayFilter });
    expect(screen.getByText("Лише сьогодні")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Показати всі дні" }));
    expect(onClearDayFilter).toHaveBeenCalledTimes(1);
  });

  it("confirms an unambiguous transfer pair on both transactions", () => {
    const overrideCategory = vi.fn();
    const outgoing = {
      ...SAMPLE_TX,
      id: "transfer-out",
      amount: -50_000,
      description: "Переказ між картками",
      accountId: "black",
      _accountId: "black",
    };
    const incoming = {
      ...SAMPLE_TX,
      id: "transfer-in",
      amount: 50_000,
      description: "З картки на картку",
      accountId: "white",
      _accountId: "white",
      type: "income" as const,
    };
    renderTransactions({
      mono: {
        realTx: [outgoing, incoming],
        accounts: [
          { id: "black", type: "black", maskedPan: ["****1111"] },
          { id: "white", type: "white", maskedPan: ["****2222"] },
        ],
      },
      storage: { overrideCategory },
    });

    expect(screen.getByText("Схоже на внутрішній переказ")).toBeInTheDocument();
    expect(screen.getByText(/Чорна.*Біла/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Це переказ" }));
    expect(overrideCategory).toHaveBeenNthCalledWith(
      1,
      "transfer-out",
      "internal_transfer",
    );
    expect(overrideCategory).toHaveBeenNthCalledWith(
      2,
      "transfer-in",
      "internal_transfer",
    );
  });

  function buildTransferPair() {
    return [
      {
        ...SAMPLE_TX,
        id: "transfer-out",
        amount: -10_000,
        description: "Переказ",
        accountId: "black",
        _accountId: "black",
      },
      {
        ...SAMPLE_TX,
        id: "transfer-in",
        amount: 10_000,
        description: "Переказ",
        accountId: "white",
        _accountId: "white",
        type: "income" as const,
      },
    ];
  }

  it("snoozes a transfer suggestion via 'Не зараз', persisted for the current Kyiv day", () => {
    const pair = buildTransferPair();
    const { unmount } = renderTransactions({ mono: { realTx: pair } });
    fireEvent.click(screen.getByRole("button", { name: "Не зараз" }));
    expect(
      screen.queryByText("Схоже на внутрішній переказ"),
    ).not.toBeInTheDocument();
    expect(
      safeReadLS<Record<string, string>>(
        FINYK_TRANSFER_SUGGESTION_SNOOZED_KEY,
        {},
      ),
    ).toEqual({ "transfer-out:transfer-in": "2026-06-15" });

    // Remount on the same Kyiv day (e.g. a reload) — stays snoozed.
    unmount();
    renderTransactions({ mono: { realTx: pair } });
    expect(
      screen.queryByText("Схоже на внутрішній переказ"),
    ).not.toBeInTheDocument();
  });

  it("re-shows a snoozed transfer suggestion once the Kyiv day advances", () => {
    const pair = buildTransferPair();
    const { unmount } = renderTransactions({ mono: { realTx: pair } });
    fireEvent.click(screen.getByRole("button", { name: "Не зараз" }));
    unmount();

    vi.setSystemTime(new Date("2026-06-16T09:00:00Z"));
    renderTransactions({ mono: { realTx: pair } });
    expect(screen.getByText("Схоже на внутрішній переказ")).toBeInTheDocument();
  });

  it("permanently rejects a transfer suggestion via 'Не переказ', surviving reload and day changes", () => {
    const pair = buildTransferPair();
    const { unmount } = renderTransactions({ mono: { realTx: pair } });
    fireEvent.click(screen.getByRole("button", { name: "Не переказ" }));
    expect(
      screen.queryByText("Схоже на внутрішній переказ"),
    ).not.toBeInTheDocument();
    expect(
      safeReadLS<string[]>(FINYK_TRANSFER_SUGGESTION_REJECTED_KEY, []),
    ).toEqual(["transfer-out:transfer-in"]);

    unmount();
    vi.setSystemTime(new Date("2026-06-16T09:00:00Z"));
    renderTransactions({ mono: { realTx: pair } });
    expect(
      screen.queryByText("Схоже на внутрішній переказ"),
    ).not.toBeInTheDocument();
  });

  it("labels the suggestion as a credit-card repayment when the incoming account has a credit limit", () => {
    const pair = buildTransferPair();
    renderTransactions({
      mono: {
        realTx: pair,
        accounts: [
          { id: "black", type: "black" },
          { id: "white", type: "black", creditLimit: 50_000 },
        ],
      },
    });
    expect(screen.getByText("Схоже на погашення кредитки")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Погашення не рахується як витрата, витратами були покупки з кредитки",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Схоже на внутрішній переказ"),
    ).not.toBeInTheDocument();
  });

  it("routes the list to the skeleton slot on first-paint loading", () => {
    renderTransactions({
      mono: buildMono({ loadingTx: true, realTx: [] }),
    });
    expect(
      document.querySelectorAll('[aria-busy="true"]').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByTestId("virtual-list")).not.toBeInTheDocument();
  });

  it("routes the list to the filter-empty slot when filters hide every row", () => {
    renderTransactions({
      mono: buildMono({ realTx: [SAMPLE_TX] }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Доходи" }));
    expect(screen.getByText("Немає транзакцій")).toBeInTheDocument();
    expect(screen.queryByTestId("virtual-list")).not.toBeInTheDocument();
  });

  it("routes the list to the first-run empty hero when activeTx is empty and not loading", () => {
    renderTransactions({
      mono: buildMono({ loadingTx: false, realTx: [] }),
    });
    expect(screen.getByText("Куди йдуть твої гроші?")).toBeInTheDocument();
    expect(screen.queryByTestId("virtual-list")).not.toBeInTheDocument();
  });

  it("renders the virtualized list when filtered rows exist", () => {
    renderTransactions({
      mono: buildMono({ realTx: [SAMPLE_TX] }),
    });
    expect(screen.getByTestId("virtual-list")).toBeInTheDocument();
  });

  it("opens the canonical bank details sheet from a transaction row", () => {
    const overrideCategory = vi.fn();
    renderTransactions({
      mono: { realTx: [SAMPLE_TX] },
      storage: { overrideCategory },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Розгорнути четвер, 4 червня/i }),
    );
    fireEvent.click(screen.getByText("Сільпо"));

    expect(
      screen.getByRole("dialog", { name: "Деталі операції" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Змінити категорію" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Транспорт" }));
    expect(overrideCategory).toHaveBeenCalledWith("tx-1", "transport");
  });

  it("keeps manual rows on the existing full manual-expense editor", () => {
    const onEditManualExpense = vi.fn();
    const manualTransaction = {
      ...SAMPLE_TX,
      id: "manual-row-1",
      manual: true,
      manualId: "manual-1",
      _manual: true,
      _manualId: "manual-1",
      source: "manual",
      _source: "manual",
    } as Transaction;
    renderTransactions({
      mono: { realTx: [manualTransaction] },
      onEditManualExpense,
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Розгорнути четвер, 4 червня/i }),
    );
    fireEvent.click(screen.getByText("Сільпо"));

    expect(onEditManualExpense).toHaveBeenCalledWith("manual-1");
    expect(
      screen.queryByRole("dialog", { name: "Деталі операції" }),
    ).not.toBeInTheDocument();
  });

  it("handlePullRefresh calls monoRefresh and requestCloudPull(2500)", async () => {
    renderTransactions();
    fireEvent.click(screen.getByTestId("trigger-refresh"));
    await vi.waitFor(() => {
      expect(mockMonoRefresh).toHaveBeenCalledTimes(1);
      expect(requestCloudPull).toHaveBeenCalledWith(2500);
    });
  });

  it("coerces an unknown sync status to idle for the sync pill", () => {
    const { rerender } = render(
      <Transactions
        mono={buildMono({
          syncState: { status: "weird-provider-state" },
          lastUpdated: null,
        })}
        storage={buildStorage()}
      />,
    );
    expect(screen.queryByText("синхронізовано")).not.toBeInTheDocument();
    expect(screen.queryByText("помилка")).not.toBeInTheDocument();
    expect(screen.queryByText(/оновлено ·/)).not.toBeInTheDocument();

    rerender(
      <Transactions
        mono={buildMono({
          syncState: { status: "weird-provider-state" },
          lastUpdated: new Date("2026-06-03T10:55:00+03:00"),
        })}
        storage={buildStorage()}
      />,
    );
    expect(screen.getByText(/оновлено ·/)).toBeInTheDocument();
    expect(screen.queryByText("синхронізовано")).not.toBeInTheDocument();
  });
});
