// @vitest-environment jsdom
/**
 * Ф-2 (а), OD-26 (2026-11-18): пошук у шапці «Операцій» — опис, нотатка,
 * тег; разом із вкладкою; дні зі збігами розгорнуті; «нічого не знайдено».
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

// Аркуш деталей відкриває секцію чека Сільпо: API глушимо, як у
// `Transactions.test.tsx`.
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
    show: vi.fn().mockReturnValue(1),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
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

const KYIV = new Date("2026-06-15T09:00:00Z");

function mkJuneTx(id: string, amount: number): Transaction {
  return {
    id,
    amount,
    time: Math.floor(new Date("2026-06-04T12:00:00+03:00").getTime() / 1000),
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

function mkTx(
  id: string,
  amount: number,
  day: string,
  description: string,
): Transaction {
  return {
    ...mkJuneTx(id, amount),
    time: Math.floor(new Date(`${day}T12:00:00+03:00`).getTime() / 1000),
    date: day,
    description,
  };
}

const SILPO_1 = mkTx("tx-1", -84550, "2026-06-04", "Сільпо");
const SILPO_2 = mkTx("tx-2", -76400, "2026-06-01", "СІЛЬПО Київ");
const KAVA = mkTx("tx-3", -14500, "2026-06-03", "Aroma Kava");
const SALARY = mkTx("tx-4", 4500000, "2026-06-02", "Зарплата");

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
    manualDebts: [],
    setManualDebts: vi.fn(),
    setLinkedTxRole: vi.fn(),
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
  // Router: аркуш деталей банківської операції читає навігацію.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
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

describe("Transactions: пошук (Ф-2 а)", () => {
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

  const search = () =>
    screen.getByRole("searchbox", { name: "Пошук операцій" });

  it("знаходить за описом без регістру й розгортає дні зі збігами", () => {
    renderTransactions({ mono: { realTx: [SILPO_1, SILPO_2, KAVA, SALARY] } });
    // До пошуку минулі дні згорнуті: рядків операцій не видно.
    expect(screen.queryByText("Aroma Kava")).toBeNull();

    fireEvent.change(search(), { target: { value: "сільпо" } });

    expect(screen.getByText("Сільпо")).toBeInTheDocument();
    expect(screen.getByText("СІЛЬПО Київ")).toBeInTheDocument();
    expect(screen.queryByText("Aroma Kava")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Знайдено 2 операції за червень 2026",
    );
  });

  it("шукає в нотатці банківської операції і в тезі ручного запису", () => {
    renderTransactions({
      mono: { realTx: [KAVA, SALARY] },
      storage: {
        txNotes: { "tx-3": "зустріч з Олею" },
        txTags: { manual_m1: ["Відпустка"] },
        manualExpenses: [
          {
            id: "m1",
            description: "Ринок",
            amount: 150,
            category: "food",
            date: "2026-06-05T10:00:00.000Z",
          },
        ],
      },
    });
    fireEvent.change(search(), { target: { value: "олею" } });
    expect(screen.getByText("Aroma Kava")).toBeInTheDocument();
    expect(screen.queryByText("Ринок")).toBeNull();

    fireEvent.change(search(), { target: { value: "ВІДПУСТКА" } });
    expect(screen.getByText("Ринок")).toBeInTheDocument();
    expect(screen.queryByText("Aroma Kava")).toBeNull();
  });

  it("діє разом із вкладкою; порожній результат очищається дією", () => {
    renderTransactions({ mono: { realTx: [SILPO_1, SALARY] } });
    fireEvent.change(search(), { target: { value: "сільпо" } });
    fireEvent.click(screen.getByRole("button", { name: "Надходження" }));

    expect(screen.getByText("Нічого не знайдено")).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Очистити пошук" }).at(-1)!,
    );

    expect(search()).toHaveValue("");
    expect(screen.queryByText("Нічого не знайдено")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("зміна місяця лишає запит", () => {
    renderTransactions({ mono: { realTx: [SILPO_1] } });
    fireEvent.change(search(), { target: { value: "сільпо" } });
    fireEvent.click(screen.getByRole("button", { name: "Попередній місяць" }));
    expect(search()).toHaveValue("сільпо");
  });
  it("глибоке посилання ?tx= відкриває деталі банківської операції один раз", async () => {
    const onFocusTxConsumed = vi.fn();
    renderTransactions({
      mono: { realTx: [KAVA, SALARY] },
      focusTxId: "tx-3",
      onFocusTxConsumed,
    });
    expect(
      await screen.findByRole("dialog", { name: "Деталі операції" }),
    ).toBeInTheDocument();
    expect(onFocusTxConsumed).toHaveBeenCalledTimes(1);
  });

  it("глибоке посилання на ручний запис відкриває його редагування", async () => {
    const onEditManualExpense = vi.fn();
    const onFocusTxConsumed = vi.fn();
    renderTransactions({
      storage: {
        manualExpenses: [
          {
            id: "m1",
            description: "Ринок",
            amount: 150,
            category: "food",
            date: "2026-06-05T10:00:00.000Z",
          },
        ],
      },
      focusTxId: "manual_m1",
      onEditManualExpense,
      onFocusTxConsumed,
    });
    await vi.waitFor(() =>
      expect(onEditManualExpense).toHaveBeenCalledWith("m1"),
    );
    expect(onFocusTxConsumed).toHaveBeenCalledTimes(1);
  });

  it("невідомий id не відкриває нічого і не зʼїдає параметр", () => {
    const onFocusTxConsumed = vi.fn();
    renderTransactions({
      mono: { realTx: [KAVA] },
      focusTxId: "nope",
      onFocusTxConsumed,
    });
    expect(
      screen.queryByRole("dialog", { name: "Деталі операції" }),
    ).toBeNull();
    expect(onFocusTxConsumed).not.toHaveBeenCalled();
  });
});
