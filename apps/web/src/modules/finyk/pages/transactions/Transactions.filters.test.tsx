// @vitest-environment jsdom
/**
 * Ф-2 (б), OD-26 (2026-11-18): аркуш «Фільтри» в «Операціях» — сума
 * «від / до», рахунок, тег; плашка активних фільтрів зі скиданням одним
 * тапом; чесний порожній стан. Спека `finyk-operations-filters.md`.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
  return render(
    <MemoryRouter>
      <Transactions
        mono={buildMono(mono)}
        storage={buildStorage(storage)}
        {...rest}
      />
    </MemoryRouter>,
  );
}

describe("Transactions: аркуш «Фільтри» (Ф-2 б)", () => {
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

  async function openSheet() {
    fireEvent.click(screen.getByRole("button", { name: "Фільтри" }));
    return screen.findByRole("dialog");
  }

  it("сума «від» звужує список, плашка скидає одним тапом", async () => {
    renderTransactions({ mono: { realTx: [SILPO_1, SILPO_2, KAVA, SALARY] } });
    const sheet = await openSheet();
    fireEvent.change(within(sheet).getByLabelText("Від"), {
      target: { value: "800" },
    });
    fireEvent.click(
      within(sheet).getByRole("button", { name: "Показати 2 операції" }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Фільтри · 1" })).toBeTruthy();
    expect(screen.getByText(/від 800 ₴/)).toBeInTheDocument();
    expect(screen.getByText("Сільпо")).toBeInTheDocument();
    expect(screen.getByText("Зарплата")).toBeInTheDocument();
    expect(screen.queryByText("Aroma Kava")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Знайдено 2 операції за червень 2026",
    );

    fireEvent.click(screen.getByRole("button", { name: "Скинути фільтри" }));
    expect(screen.getByRole("button", { name: "Фільтри" })).toBeTruthy();
    expect(screen.queryByText(/від 800 ₴/)).toBeNull();
  });

  it("тег і рахунок разом; порожній результат має дію скинути", async () => {
    renderTransactions({
      mono: { realTx: [SILPO_1, KAVA] },
      storage: {
        txTags: { "tx-1": ["Дім"], "tx-3": ["Кава"] },
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
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole("radio", { name: "Кава" }));
    fireEvent.click(within(sheet).getByRole("radio", { name: "Без рахунку" }));
    fireEvent.click(
      within(sheet).getByRole("button", { name: "Показати 0 операцій" }),
    );

    expect(screen.getByText("Нічого не знайдено")).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Скинути фільтри" }).at(-1)!,
    );
    expect(screen.queryByText("Нічого не знайдено")).toBeNull();
  });

  it("«від» більше за «до»: пояснення і кнопка неактивна", async () => {
    renderTransactions({ mono: { realTx: [SILPO_1, KAVA] } });
    const sheet = await openSheet();
    fireEvent.change(within(sheet).getByLabelText("Від"), {
      target: { value: "500" },
    });
    fireEvent.change(within(sheet).getByLabelText("До"), {
      target: { value: "100" },
    });
    expect(within(sheet).getByRole("alert")).toHaveTextContent(
      "«Від» має бути не більше за «до».",
    );
    expect(
      within(sheet).getByRole("button", { name: /^Показати/ }),
    ).toBeDisabled();
  });
});
