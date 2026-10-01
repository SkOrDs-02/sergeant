// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
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

  it("дрил-даун з Аналітики: категорія за минулий місяць відкриває Операції на тому ж місяці", () => {
    const fetchMonth = vi.fn(() => Promise.resolve());
    const mayTime = Math.floor(
      new Date("2026-05-12T12:00:00+03:00").getTime() / 1000,
    );
    const foodMay = {
      ...mkJuneTx("food-may", -100, { time: mayTime }),
      description: "Травнева їжа",
      date: "2026-05-12",
    };
    const taxiMay = {
      ...mkJuneTx("taxi-may", -200, { time: mayTime }),
      description: "Травневе таксі",
      date: "2026-05-12",
    };
    renderTransactions({
      mono: { fetchMonth, historyTx: [foodMay, taxiMay] },
      storage: {
        txCategories: { "food-may": "food", "taxi-may": "transport" },
      },
      categoryFilter: "food",
      categoryMonth: { year: 2026, month: 5 },
    });
    expect(screen.getByText(/травень 2026/i)).toBeInTheDocument();
    expect(fetchMonth).toHaveBeenCalledWith(2026, 4);
    // Лишився рівно один рядок (категорія «food»), а не всі два за травень.
    expect(
      screen.getByRole("button", { name: "Вивантажити операції у CSV: 1" }),
    ).toBeInTheDocument();
  });

  describe("CSV-експорт: коли казати «Вивантажено»", () => {
    // Справжній ланцюжок `exportTransactionsCsv` → `saveStringAsFile`;
    // підмінена лише межа браузера: blob-URL, клік по `<a download>`,
    // `navigator.share` і ознаки iOS standalone-PWA. Деталі віддачі файла
    // пінує `shared/lib/ui/export.test.ts`.
    const NAV_PROPS = ["share", "canShare", "standalone"] as const;
    let createObjectURL: ReturnType<typeof vi.fn>;
    let downloadName: string | null;

    beforeEach(() => {
      createObjectURL = vi.fn(() => "blob:mock-url");
      Object.defineProperty(URL, "createObjectURL", {
        value: createObjectURL,
        configurable: true,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        value: vi.fn(),
        configurable: true,
      });
      downloadName = null;
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        function (this: HTMLAnchorElement) {
          downloadName = this.download;
        },
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
      for (const key of NAV_PROPS) {
        Reflect.deleteProperty(navigator, key);
      }
    });

    /** iOS standalone-PWA з `navigator.share`, що відповідає `share`. */
    function asIosPwa(share: () => Promise<void>) {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      );
      const shareFn = vi.fn(share);
      Object.defineProperty(navigator, "standalone", {
        value: true,
        configurable: true,
      });
      Object.defineProperty(navigator, "canShare", {
        value: () => true,
        configurable: true,
      });
      Object.defineProperty(navigator, "share", {
        value: shareFn,
        configurable: true,
      });
      return shareFn;
    }

    const clickExport = async () => {
      renderTransactions({ mono: { realTx: [SAMPLE_TX] } });
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: /Вивантажити операції у CSV/ }),
        );
      });
    };

    it("звичайне завантаження → тост із кількістю рядків і файл видимого місяця", async () => {
      await clickExport();
      expect(downloadName).toBe("finyk-2026-06.csv");
      expect(mockToast.success).toHaveBeenCalledWith("Вивантажено операцій: 1");
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it("iOS PWA: файл іде в «Поділитись», тост після шерингу", async () => {
      const share = asIosPwa(() => Promise.resolve());
      await clickExport();
      expect(share).toHaveBeenCalledTimes(1);
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalledWith("Вивантажено операцій: 1");
    });

    it("скасування аркуша «Поділитись» — без тосту: вивантаження не було", async () => {
      asIosPwa(() =>
        Promise.reject(
          Object.assign(new Error("closed"), { name: "AbortError" }),
        ),
      );
      await clickExport();
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(mockToast.success).not.toHaveBeenCalled();
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it("збій віддачі — тост «Не вдалося вивантажити операції» з «Повторити»", async () => {
      createObjectURL.mockImplementationOnce(() => {
        throw new Error("boom");
      });
      await clickExport();
      expect(mockToast.success).not.toHaveBeenCalled();
      expect(mockToast.error).toHaveBeenCalledTimes(1);
      expect(String(mockToast.error.mock.calls[0]![0])).toMatch(
        /вивантажити операції/,
      );

      // «Повторити» збирає файл заново і, коли віддача вдалась, каже
      // «Вивантажено…».
      const action = mockToast.error.mock.calls[0]![2] as {
        label: string;
        onClick: () => void;
      };
      expect(action.label).toBe("Повторити");
      await act(async () => {
        action.onClick();
      });
      expect(createObjectURL).toHaveBeenCalledTimes(2);
      expect(mockToast.success).toHaveBeenCalledWith("Вивантажено операцій: 1");
    });
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
      screen.getByRole("toolbar", { name: "Фільтр операцій" }),
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

  describe("card ↔ jar transfers", () => {
    // Реальні описи виписки Monobank (звіт власника): жоден не містить
    // слова «переказ», а в `accounts` банок немає — вони лише в `jars`.
    const jarLeg = {
      ...SAMPLE_TX,
      id: "jar-leg",
      amount: -40_000,
      description: "На білу картку",
      accountId: "jar-1",
      _accountId: "jar-1",
    };
    const cardLeg = {
      ...SAMPLE_TX,
      id: "card-leg",
      amount: 40_000,
      description: "Часткове зняття банки «просто»",
      accountId: "white",
      _accountId: "white",
      type: "income" as const,
    };
    const accounts = [{ id: "white", type: "white", maskedPan: ["****2222"] }];

    it("suggests the pair from the real Monobank phrasing alone", () => {
      renderTransactions({ mono: { realTx: [jarLeg, cardLeg], accounts } });
      expect(
        screen.getByText("Схоже на внутрішній переказ"),
      ).toBeInTheDocument();
    });

    it("a leg on a known jar is a marker even when no description is", () => {
      const neutral = [
        { ...jarLeg, description: "Витрата" },
        { ...cardLeg, description: "Надходження" },
      ];
      const { unmount } = renderTransactions({
        mono: { realTx: neutral, accounts },
      });
      expect(
        screen.queryByText("Схоже на внутрішній переказ"),
      ).not.toBeInTheDocument();
      unmount();

      renderTransactions({
        mono: { realTx: neutral, accounts, jars: [{ monoJarId: "jar-1" }] },
      });
      expect(
        screen.getByText("Схоже на внутрішній переказ"),
      ).toBeInTheDocument();
    });
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

  it("holds transfer suggestions until the SQLite storage cache is warm", () => {
    renderTransactions({
      mono: { realTx: buildTransferPair() },
      storage: { storageReady: false },
    });
    expect(
      screen.queryByText("Схоже на внутрішній переказ"),
    ).not.toBeInTheDocument();
  });

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
        "Погашення не рахується як витрата. Витратою вже були самі покупки кредиткою.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Схоже на внутрішній переказ"),
    ).not.toBeInTheDocument();
    // Заголовок питає про погашення — кнопки мають відповідати про нього ж,
    // а не про «переказ» (звіт власника 2026-09-14).
    expect(
      screen.getByRole("button", { name: "Так, це погашення" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ні, різні операції" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Пізніше" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Це переказ" }),
    ).not.toBeInTheDocument();
    // Кредитний рахунок названо в рядку напрямку: без цього з двох карток
    // не видно, яка з них кредитка, на якій і тримається вся підказка.
    expect(screen.getByText(/Чорна.*·\sкредитна/)).toBeInTheDocument();
  });

  it("confirms a credit-card repayment via the repayment-worded button", () => {
    const overrideCategory = vi.fn();
    const pair = buildTransferPair();
    renderTransactions({
      mono: {
        realTx: pair,
        accounts: [
          { id: "black", type: "black" },
          { id: "white", type: "black", creditLimit: 50_000 },
        ],
      },
      storage: { overrideCategory },
    });
    fireEvent.click(screen.getByRole("button", { name: "Так, це погашення" }));
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

  it("puts the sign on each leg's amount, not on its date", () => {
    const pair = buildTransferPair();
    renderTransactions({ mono: { realTx: pair } });
    // Регресія, заради якої розкладку й переробляли: знак стояв перед датою
    // («−11 вер.») і читався як «мінус одинадцяте», а сума в кутку не
    // належала жодній із двох ніг.
    const card = screen
      .getByText("Схоже на внутрішній переказ")
      .closest("div")?.parentElement;
    expect(card).toBeTruthy();
    expect(card?.textContent).toContain("−100");
    expect(card?.textContent).toContain("+100");
    expect(card?.textContent).not.toMatch(/[−+]\d+\s*(вер|чер)/);
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
    fireEvent.click(screen.getByRole("button", { name: "Надходження" }));
    expect(screen.getByText("Немає операцій")).toBeInTheDocument();
    expect(screen.queryByTestId("virtual-list")).not.toBeInTheDocument();
  });

  it("routes the list to the list-scoped no-data state when activeTx is empty and not loading", () => {
    renderTransactions({
      mono: buildMono({ loadingTx: false, realTx: [] }),
    });
    // F1: Транзакції більше НЕ повторюють герой Огляду. Порожній перший
    // вхід віддає власну list-scoped заглушку — див. `TransactionList.tsx`.
    expect(screen.getByText("Операцій ще немає")).toBeInTheDocument();
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
    // Категорії живуть у згорнутому `CategoryPickerField`, а не пласким
    // списком кнопок: спершу тап по тригеру, і лише потім по опції. Тригер
    // шукаємо за `aria-expanded` всередині секції «Категорія та нотатка», а
    // не за назвою авто-категорії — інакше тест ламатиметься щоразу, коли
    // зміниться правило авто-категоризації «Сільпо».
    const categorySection = screen.getByRole("region", {
      name: "Категорія та нотатка",
    });
    expect(screen.queryByRole("button", { name: "Транспорт" })).toBeNull();
    fireEvent.click(
      within(categorySection).getByRole("button", { expanded: false }),
    );
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
    expect(screen.queryByText("не синхронізовано")).not.toBeInTheDocument();
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
