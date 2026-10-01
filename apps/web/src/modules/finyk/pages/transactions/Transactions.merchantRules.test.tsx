// @vitest-environment jsdom
/**
 * Наскрізний сценарій «Завжди так для цього магазину» (рішення власника
 * 2026-10-01) на сторінці Операцій: людина міняє категорію в аркуші, одним
 * тапом закріплює її за мерчантом, і ТІ САМІ рядки (минулі, інший номер
 * філії) підхоплюють категорію без жодного окремого запису; тост скасування
 * повертає все назад. Запис іде крізь справжній `useFinykMerchantRules`.
 */
import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import type { MerchantRule } from "@sergeant/finyk-domain/lib/merchantRules";

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

const { mockToast } = vi.hoisted(() => ({
  mockToast: {
    show: vi.fn(() => 1),
    success: vi.fn(() => 2),
    error: vi.fn(() => 3),
    info: vi.fn(() => 4),
    warning: vi.fn(() => 5),
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
  requestCloudPull: vi.fn(() => Promise.resolve()),
}));
vi.mock("@shared/hooks/useCloudPullPending", () => ({
  useCloudPullPending: vi.fn(() => false),
}));
vi.mock("@shared/hooks/useToast", () => ({
  useToast: vi.fn(() => mockToast),
}));
vi.mock("@shared/components/ui/PullToRefresh", () => ({
  PullToRefresh: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { Transactions } from "./Transactions";
import type {
  TransactionsMonoSlice,
  TransactionsStorageSlice,
} from "./Transactions";
import { useFinykMerchantRules } from "../../hooks/useFinykMerchantRules";

const NOW = new Date("2026-06-15T09:00:00Z");

function mkTx(id: string, description: string, amount = -25000): Transaction {
  return {
    id,
    amount,
    time: Math.floor(new Date("2026-06-04T12:00:00+03:00").getTime() / 1000),
    date: "2026-06-04",
    description,
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

const SILPO_A = mkTx("tx-a", "Сільпо №1");
const SILPO_B = mkTx("tx-b", "СІЛЬПО 45", -10000);
const OTHER = mkTx("tx-c", "Аптека Доброго Дня", -5000);

function buildMono(): TransactionsMonoSlice {
  return {
    realTx: [SILPO_A, SILPO_B, OTHER],
    loadingTx: false,
    lastUpdated: null,
    syncState: { status: "idle" },
    accounts: [],
    fetchMonth: vi.fn(() => Promise.resolve()),
    historyTx: [],
    loadingHistory: false,
    refresh: vi.fn(() => Promise.resolve()),
  };
}

/** Тримає і явні override-и, і правила в стейті, як це робить `useStorage`. */
function Harness({ initialRules = [] }: { initialRules?: MerchantRule[] }) {
  const [txCategories, setTxCategories] = useState<Record<string, string>>({});
  const [merchantRules, setMerchantRules] =
    useState<MerchantRule[]>(initialRules);
  const rules = useFinykMerchantRules({ merchantRules, setMerchantRules });

  const storage: TransactionsStorageSlice = {
    hiddenTxIds: [],
    hideTx: vi.fn(),
    excludedTxIds: new Set<string>(),
    excludedStatTxIds: [],
    toggleExcludeFromStats: vi.fn(),
    txCategories,
    customCategories: [],
    overrideCategory: (id, catId) =>
      setTxCategories((prev) => {
        const next = { ...prev };
        if (catId === null) delete next[id];
        else next[id] = catId;
        return next;
      }),
    merchantRuleIndex: rules.merchantRuleIndex,
    upsertMerchantRule: rules.upsertMerchantRule,
    undoMerchantRule: rules.undoMerchantRule,
    deleteMerchantRule: rules.deleteMerchantRule,
    restoreMerchantRules: rules.restoreMerchantRules,
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
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <Transactions mono={buildMono()} storage={storage} />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function rowOf(description: string): HTMLElement {
  const row = screen
    .getAllByRole("button")
    .find((b) => b.textContent?.includes(description));
  if (!row) throw new Error(`Рядок «${description}» не знайдено`);
  return row;
}

function lastToastAction() {
  const call = mockToast.show.mock.calls.at(-1) as unknown as [
    string,
    string,
    number,
    { label: string; kind?: string; onClick: () => void },
  ];
  return { msg: call[0], action: call[3] };
}

function openSheetFor(description: string) {
  fireEvent.click(
    screen.getByRole("button", { name: /Розгорнути четвер, 4 червня/i }),
  );
  fireEvent.click(within(rowOf(description)).getByText(description));
  return screen.getByRole("dialog", { name: "Деталі операції" });
}

function pickCategoryInSheet(label: string) {
  const section = screen.getByRole("region", { name: "Категорія та нотатка" });
  fireEvent.click(within(section).getByRole("button", { expanded: false }));
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("Операції: «Завжди так для цього магазину»", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("зміна категорії → «Завжди так» → той самий мерчант в інших рядках, тост скасування повертає все", () => {
    render(<Harness />);
    openSheetFor("Сільпо №1");

    // Поки явної зміни нема, правило не пропонується.
    expect(
      screen.queryByRole("button", { name: /Завжди так для/ }),
    ).not.toBeInTheDocument();

    pickCategoryInSheet("Транспорт");
    fireEvent.click(
      screen.getByRole("button", { name: "Завжди так для «Сільпо №1»" }),
    );

    // Тост із відкатом (5 с, `kind: undo`), тексти за style-guide.
    const { msg, action } = lastToastAction();
    expect(msg).toBe("Правило збережено: «Сільпо №1» тепер у «Транспорт»");
    expect(action).toMatchObject({ label: "Скасувати", kind: "undo" });

    // Після створення блок змінюється на «Діє правило».
    expect(screen.getByText(/Діє правило для «Сільпо №1»/)).toBeInTheDocument();

    // Закриваємо аркуш: інший рядок того ж мерчанта вже в «Транспорт» за
    // правилом, інший мерчант не зачеплений.
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    const rowB = rowOf("СІЛЬПО 45");
    expect(within(rowB).getByText("Транспорт")).toBeInTheDocument();
    expect(within(rowB).getByText("за правилом")).toBeInTheDocument();
    const rowC = rowOf("Аптека Доброго Дня");
    expect(within(rowC).queryByText("Транспорт")).not.toBeInTheDocument();
    expect(within(rowC).queryByText("за правилом")).not.toBeInTheDocument();
    // Сама операція несе явний override (мітка «змін.»), а не «за правилом».
    const rowA = rowOf("Сільпо №1");
    expect(within(rowA).getByText("змін.")).toBeInTheDocument();

    // Скасування з тосту: правило зникає, рядок B повертається до авто.
    act(() => action.onClick());
    expect(
      within(rowOf("СІЛЬПО 45")).queryByText("за правилом"),
    ).not.toBeInTheDocument();
    expect(
      within(rowOf("СІЛЬПО 45")).queryByText("Транспорт"),
    ).not.toBeInTheDocument();
  });

  it("існуюче правило: рядки малюють його категорію, а «Прибрати правило» знімає її з тостом «Повернути»", () => {
    const rule: MerchantRule = {
      id: "mr_seed",
      kind: "expense",
      merchantKey: "сільпо",
      categoryId: "transport",
      label: "Сільпо №1",
      createdAt: "2026-10-01T10:00:00.000Z",
      updatedAt: "2026-10-01T10:00:00.000Z",
    };
    render(<Harness initialRules={[rule]} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Розгорнути четвер, 4 червня/i }),
    );
    // Ретроактивно: обидва рядки Сільпо вже в «Транспорт».
    expect(within(rowOf("Сільпо №1")).getByText("Транспорт")).toBeTruthy();
    expect(within(rowOf("СІЛЬПО 45")).getByText("Транспорт")).toBeTruthy();

    fireEvent.click(within(rowOf("СІЛЬПО 45")).getByText("СІЛЬПО 45"));
    fireEvent.click(screen.getByRole("button", { name: "Прибрати правило" }));

    const { msg, action } = lastToastAction();
    expect(msg).toBe("Правило для «Сільпо №1» прибрано");
    expect(action).toMatchObject({ label: "Повернути", kind: "undo" });

    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    expect(
      within(rowOf("Сільпо №1")).queryByText("Транспорт"),
    ).not.toBeInTheDocument();

    act(() => action.onClick());
    expect(within(rowOf("Сільпо №1")).getByText("Транспорт")).toBeTruthy();
  });

  it("явний вибір на одній операції сильніший за правило й не чіпає решту рядків мерчанта", () => {
    const rule: MerchantRule = {
      id: "mr_seed",
      kind: "expense",
      merchantKey: "сільпо",
      categoryId: "transport",
      label: "Сільпо №1",
      createdAt: "2026-10-01T10:00:00.000Z",
      updatedAt: "2026-10-01T10:00:00.000Z",
    };
    render(<Harness initialRules={[rule]} />);
    openSheetFor("СІЛЬПО 45");
    pickCategoryInSheet("Продукти");

    // Явний вибір відрізняється від правила, тож пропонується «Оновити».
    expect(
      screen.getByRole("button", { name: /Оновити правило для/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));

    const rowB = rowOf("СІЛЬПО 45");
    expect(within(rowB).getByText("Продукти")).toBeInTheDocument();
    expect(within(rowB).getByText("змін.")).toBeInTheDocument();
    // Сусідній рядок мерчанта лишився за правилом.
    const rowA = rowOf("Сільпо №1");
    expect(within(rowA).getByText("Транспорт")).toBeInTheDocument();
    expect(within(rowA).getByText("за правилом")).toBeInTheDocument();
    expect(mockToast.error).not.toHaveBeenCalled();
  });
});
