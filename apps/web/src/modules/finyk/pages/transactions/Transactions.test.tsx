// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

const { mockRequestCloudPull, mockMonoRefresh, mockToast } = vi.hoisted(() => ({
  mockRequestCloudPull: vi.fn(() => Promise.resolve()),
  mockMonoRefresh: vi.fn(() => Promise.resolve()),
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("react-virtuoso", () => ({
  GroupedVirtuoso: ({
    groupCounts,
    groupContent,
    itemContent,
  }: {
    groupCounts: number[];
    groupContent: (i: number) => React.ReactNode;
    itemContent: (i: number) => React.ReactNode;
  }) => {
    const total = groupCounts.reduce((s, n) => s + n, 0);
    return (
      <div data-testid="grouped-virtuoso">
        {groupCounts.map((_, gi) => (
          <div key={`g-${gi}`}>{groupContent(gi)}</div>
        ))}
        {Array.from({ length: total }).map((_, i) => (
          <div key={`i-${i}`}>{itemContent(i)}</div>
        ))}
      </div>
    );
  },
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
  return render(
    <Transactions
      mono={buildMono(mono)}
      storage={buildStorage(storage)}
      {...rest}
    />,
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

  it("routes the list to the skeleton slot on first-paint loading", () => {
    renderTransactions({
      mono: buildMono({ loadingTx: true, realTx: [] }),
    });
    expect(
      document.querySelectorAll('[aria-busy="true"]').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByTestId("grouped-virtuoso")).not.toBeInTheDocument();
  });

  it("routes the list to the filter-empty slot when filters hide every row", () => {
    renderTransactions({
      mono: buildMono({ realTx: [SAMPLE_TX] }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Доходи" }));
    expect(screen.getByText("Немає транзакцій")).toBeInTheDocument();
    expect(screen.queryByTestId("grouped-virtuoso")).not.toBeInTheDocument();
  });

  it("routes the list to the first-run empty hero when activeTx is empty and not loading", () => {
    renderTransactions({
      mono: buildMono({ loadingTx: false, realTx: [] }),
    });
    expect(screen.getByText("Куди йдуть твої гроші?")).toBeInTheDocument();
    expect(screen.queryByTestId("grouped-virtuoso")).not.toBeInTheDocument();
  });

  it("renders the virtualized list when filtered rows exist", () => {
    renderTransactions({
      mono: buildMono({ realTx: [SAMPLE_TX] }),
    });
    expect(screen.getByTestId("grouped-virtuoso")).toBeInTheDocument();
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
