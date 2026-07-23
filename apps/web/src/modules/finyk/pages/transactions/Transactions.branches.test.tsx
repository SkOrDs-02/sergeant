// @vitest-environment jsdom
/**
 * Branch-focused integration coverage for Transactions page — batch select
 * mode, toolbar visibility, and batch action wiring through the page shell.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

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

const SAMPLE_TX = mkJuneTx("tx-1", -250);
const SAMPLE_TX_2 = mkJuneTx("tx-2", -500);

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

describe("Transactions page (branches)", () => {
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

  it("does not show the batch toolbar until select mode is enabled", () => {
    renderTransactions({
      mono: { realTx: [SAMPLE_TX] },
    });
    expect(screen.queryByText("Оберіть транзакції")).toBeNull();
  });

  it("shows the empty-selection hint inline in the header after entering select mode", () => {
    renderTransactions({
      mono: { realTx: [SAMPLE_TX] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Режим вибору" }));
    expect(screen.getByText("Оберіть транзакції")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Скасувати" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Категорія" })).toBeNull();
  });

  function enterSelectModeWithExpandedDay() {
    fireEvent.click(screen.getByRole("button", { name: "Режим вибору" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Розгорнути четвер, 4 червня/i }),
    );
  }

  function clickBatchToolbarButton(name: string) {
    const buttons = screen.getAllByRole("button", { name });
    fireEvent.click(buttons[buttons.length - 1]!);
  }

  it("reveals batch actions after selecting a transaction", () => {
    renderTransactions({
      mono: { realTx: [SAMPLE_TX, SAMPLE_TX_2] },
    });
    enterSelectModeWithExpandedDay();
    fireEvent.click(screen.getAllByRole("button", { name: "Вибрати" })[0]!);
    expect(screen.getByText("1 обрано")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Категорія" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Приховати" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", {
        name: "Не враховувати у статистиці",
      }).length,
    ).toBeGreaterThan(0);
  });

  it("wires batch hide through hideTx with undo toast", () => {
    const hideTx = vi.fn();
    renderTransactions({
      mono: { realTx: [SAMPLE_TX] },
      storage: { hideTx },
    });
    enterSelectModeWithExpandedDay();
    fireEvent.click(screen.getByRole("button", { name: "Вибрати" }));
    clickBatchToolbarButton("Приховати");
    expect(hideTx).toHaveBeenCalledWith("tx-1");
    expect(mockToast.show).toHaveBeenCalled();
  });

  it("wires batch exclude through toggleExcludeFromStats", () => {
    const toggleExcludeFromStats = vi.fn();
    renderTransactions({
      mono: { realTx: [SAMPLE_TX] },
      storage: { toggleExcludeFromStats },
    });
    enterSelectModeWithExpandedDay();
    fireEvent.click(screen.getByRole("button", { name: "Вибрати" }));
    clickBatchToolbarButton("Не враховувати у статистиці");
    expect(toggleExcludeFromStats).toHaveBeenCalledWith("tx-1");
    expect(mockToast.show).toHaveBeenCalled();
  });

  it("opens the category picker sheet from the batch toolbar", () => {
    renderTransactions({
      mono: { realTx: [SAMPLE_TX] },
      storage: {
        customCategories: [
          { id: "pets", label: "Тварини", emoji: "🐾" } as never,
        ],
      },
    });
    enterSelectModeWithExpandedDay();
    fireEvent.click(screen.getByRole("button", { name: "Вибрати" }));
    fireEvent.click(screen.getByRole("button", { name: "Категорія" }));
    expect(
      screen.getByRole("dialog", { name: "Вибрати категорію" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Тварини/ }));
    expect(
      screen.queryByRole("dialog", { name: "Вибрати категорію" }),
    ).toBeNull();
  });

  it("shows trailing refresh copy when reloading with existing rows", () => {
    renderTransactions({
      mono: { realTx: [SAMPLE_TX], loadingTx: true },
    });
    expect(screen.getByText("⟳ оновлення…")).toBeInTheDocument();
  });
});
