// @vitest-environment jsdom
/**
 * Coverage tests for AssetsTxPickerView — the full-screen transaction-linking
 * overlay rendered by the Assets page. It is a pure presentational component
 * (all data flows in as props), so we render it directly and exercise each of
 * the four modes (monoDebt, sub, debt, receivable), the four not-found early
 * returns, and the row-tap callbacks.
 *
 * Money is integer kopiykas (number); time pinned to Europe/Kyiv.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { AssetsTxPickerView } from "./AssetsTxPickerView";
import type { TxRowTx } from "../components/TxRow";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";

// Пікер тягне власний, ширший діапазон транзакцій (див.
// `useLinkableTransactions`) — у тестах мережу глушимо, а дані подаємо
// пропом `transactions`, який хук зливає як базу.
vi.mock("../hooks/monoTransactionsLoader", () => ({
  fetchAllMonoTransactions: vi.fn(async () => []),
}));

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return rtlRender(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

const KYIV = new Date("2026-06-15T09:00:00Z");
const NOW_S = Math.floor(KYIV.getTime() / 1000);

function mkTx(overrides: Partial<TxRowTx> = {}): TxRowTx {
  return {
    id: "tx-1",
    amount: -5000,
    description: "Магазин",
    mcc: 5411,
    time: NOW_S,
    currencyCode: 980,
    ...overrides,
  };
}

const account = {
  id: "acc-1",
  type: "black",
  balance: -10000,
  creditLimit: 100000,
} as MonoAccount;

function baseProps() {
  return {
    setTxPicker: vi.fn(),
    accounts: [account] as readonly MonoAccount[],
    transactions: [] as readonly TxRowTx[],
    monoDebtLinkedTxIds: {} as Record<string, string[]>,
    toggleMonoDebtTx: vi.fn(),
    subscriptions: [] as never[],
    updateSubscription: vi.fn(),
    manualDebts: [] as never[],
    receivables: [] as never[],
    setLinkedTxRole: vi.fn(),
    showBalance: true,
    customCategories: [] as never[],
  };
}

describe("AssetsTxPickerView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(KYIV);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("monoDebt mode", () => {
    it("renders only a back button when the account is not found", () => {
      const setTxPicker = vi.fn();
      render(
        <AssetsTxPickerView
          {...baseProps()}
          setTxPicker={setTxPicker}
          txPicker={{ type: "monoDebt", id: "missing" }}
        />,
      );
      const back = screen.getByText("Назад");
      fireEvent.click(back);
      expect(setTxPicker).toHaveBeenCalledWith(null);
    });

    it("renders the debt header, progress card and suggested rows", () => {
      const toggleMonoDebtTx = vi.fn();
      const transactions = [
        mkTx({
          id: "in-1",
          amount: 20000,
          _accountId: "acc-1",
          description: "Поповнення",
        }), // suggested top-up
        mkTx({ id: "ex-1", amount: -3000, _accountId: "acc-1" }),
      ];
      render(
        <AssetsTxPickerView
          {...baseProps()}
          transactions={transactions}
          monoDebtLinkedTxIds={{ "acc-1": ["in-1"] }}
          toggleMonoDebtTx={toggleMonoDebtTx}
          txPicker={{ type: "monoDebt", id: "acc-1" }}
        />,
      );
      expect(screen.getByText(/залишок боргу/)).toBeInTheDocument();
      expect(screen.getByText(/Погашено цього місяця/)).toBeInTheDocument();
      // tapping a row toggles the link
      fireEvent.click(screen.getByText("Магазин"));
      expect(toggleMonoDebtTx).toHaveBeenCalledWith("acc-1", "ex-1");
    });

    it("зарплата на інший рахунок не рахується погашенням картки", () => {
      // Регресія: правило відсіювало лише покупку по самій картці, тож
      // привʼязане надходження на дебетку мовчки рахувалось погашенням.
      render(
        <AssetsTxPickerView
          {...baseProps()}
          transactions={[
            mkTx({
              id: "salary",
              amount: 3_000_000,
              _accountId: "debit-1",
              description: "Зарплата",
            }),
          ]}
          monoDebtLinkedTxIds={{ "acc-1": ["salary"] }}
          txPicker={{ type: "monoDebt", id: "acc-1" }}
        />,
      );
      // Базовий борг = погашено + залишок. Якби зарплата зарахувалась,
      // тут було б 30 100, а не самий лише банківський залишок.
      // Текст розбитий на кілька вузлів (JSX-інтерполяція), тому
      // порівнюємо нормалізований `textContent` рядка-підсумку.
      const summary = screen
        .getByText(/Базовий борг/)
        .textContent?.replace(/\s+/g, " ");
      // Залишок з банку = (creditLimit 100000 − balance −10000)/100 = 1100 ₴.
      expect(summary).toContain("Погашено цього місяця: 0 ₴");
      expect(summary).toContain("Базовий борг: 1 100 ₴");
      // Якби зарплата (30 000 ₴) зарахувалась, було б 31 100.
      expect(summary).not.toContain("31 100");
    });

    it("«Погашено» не залежить від пошуку", () => {
      // Регресія: сума рахувалась по відфільтрованому списку, тож будь-який
      // ввід у пошук її змінював, хоча привʼязки ті самі.
      render(
        <AssetsTxPickerView
          {...baseProps()}
          transactions={[
            mkTx({
              id: "topup",
              amount: 50_000,
              _accountId: "acc-1",
              description: "Поповнення",
            }),
          ]}
          monoDebtLinkedTxIds={{ "acc-1": ["topup"] }}
          txPicker={{ type: "monoDebt", id: "acc-1" }}
        />,
      );
      const summaryText = () =>
        screen.getByText(/Базовий борг/).textContent?.replace(/\s+/g, " ");
      const before = summaryText();
      expect(before).toContain("Погашено цього місяця: 500 ₴");

      fireEvent.change(screen.getByLabelText("Пошук транзакцій"), {
        target: { value: "нічого-не-знайдено" },
      });
      expect(summaryText()).toBe(before);
    });

    it("привʼязаний рядок каже, що саме привʼязка зробила", () => {
      // Регресія: галочка `TxRow` означає лише «привʼязано». Покупка по
      // картці й рух на чужому рахунку в погашене не йдуть, тож мовчазна
      // галочка обіцяла внесок, якого немає.
      render(
        <AssetsTxPickerView
          {...baseProps()}
          transactions={[
            mkTx({
              id: "topup",
              amount: 50_000,
              _accountId: "acc-1",
              description: "Поповнення",
            }),
            mkTx({
              id: "buy",
              amount: -20_000,
              _accountId: "acc-1",
              description: "Покупка",
            }),
            mkTx({
              id: "salary",
              amount: 3_000_000,
              _accountId: "debit-1",
              description: "Зарплата",
            }),
          ]}
          monoDebtLinkedTxIds={{ "acc-1": ["topup", "buy", "salary"] }}
          txPicker={{ type: "monoDebt", id: "acc-1" }}
        />,
      );
      // Гліф «✅» прибрано 2026-08-03, тож заголовок групи «Погашення» тепер
      // збігається з префіксом рядка «Погашення: …» — матчимо саме заголовок.
      expect(
        screen.getByText((_t, el) => el?.textContent === "Погашення"),
      ).toBeInTheDocument();
      expect(screen.getByText(/Покупка по картці/)).toBeInTheDocument();
      expect(screen.getByText(/Рух на іншому рахунку/)).toBeInTheDocument();
    });

    it("shows available older transactions when the last 90 days are empty", () => {
      render(
        <AssetsTxPickerView
          {...baseProps()}
          transactions={[
            mkTx({
              id: "old-1",
              description: "Стара транзакція",
              time: Math.floor(
                new Date("2025-01-10T12:00:00Z").getTime() / 1000,
              ),
            }),
          ]}
          txPicker={{ type: "monoDebt", id: "acc-1" }}
        />,
      );

      expect(screen.getByText("Стара транзакція")).toBeInTheDocument();
    });

    it("sorts available transactions newest first", () => {
      render(
        <AssetsTxPickerView
          {...baseProps()}
          transactions={[
            mkTx({
              id: "older",
              description: "Старіша операція",
              time: Math.floor(
                new Date("2026-06-10T12:00:00Z").getTime() / 1000,
              ),
            }),
            mkTx({
              id: "newer",
              description: "Новіша операція",
              time: Math.floor(
                new Date("2026-06-14T12:00:00Z").getTime() / 1000,
              ),
            }),
          ]}
          txPicker={{ type: "monoDebt", id: "acc-1" }}
        />,
      );

      const newer = screen.getByText("Новіша операція");
      const older = screen.getByText("Старіша операція");
      expect(newer.compareDocumentPosition(older)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
  });

  describe("sub mode", () => {
    it("renders only a back button when the subscription is not found", () => {
      render(
        <AssetsTxPickerView
          {...baseProps()}
          txPicker={{ type: "sub", subId: "missing" }}
        />,
      );
      expect(screen.getByText("Назад")).toBeInTheDocument();
    });

    it("links a transaction and sets the billing day from its Kyiv date", () => {
      const updateSubscription = vi.fn();
      const setTxPicker = vi.fn();
      const subscriptions = [{ id: "s1", name: "Netflix" }];
      const transactions = [mkTx({ id: "e1", amount: -4000 })];
      render(
        <AssetsTxPickerView
          {...baseProps()}
          setTxPicker={setTxPicker}
          subscriptions={subscriptions as never}
          updateSubscription={updateSubscription}
          transactions={transactions}
          txPicker={{ type: "sub", subId: "s1" }}
        />,
      );
      expect(screen.getByText(/Netflix/)).toBeInTheDocument();
      fireEvent.click(screen.getByText("Магазин"));
      expect(updateSubscription).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({ linkedTxId: "e1", billingDay: 15 }),
      );
      expect(setTxPicker).toHaveBeenCalledWith(null);
    });

    it("unlinks when tapping the already-linked transaction", () => {
      const updateSubscription = vi.fn();
      const subscriptions = [{ id: "s1", name: "Netflix", linkedTxId: "e1" }];
      const transactions = [mkTx({ id: "e1", amount: -4000 })];
      render(
        <AssetsTxPickerView
          {...baseProps()}
          subscriptions={subscriptions as never}
          updateSubscription={updateSubscription}
          transactions={transactions}
          txPicker={{ type: "sub", subId: "s1" }}
        />,
      );
      // "Зняти привʼязку" affordance shows when a link exists
      expect(screen.getByText(/Зняти/)).toBeInTheDocument();
      fireEvent.click(screen.getByText("Магазин"));
      expect(updateSubscription).toHaveBeenCalledWith("s1", {
        linkedTxId: null,
      });
    });

    it("unlinks via the explicit 'Зняти привʼязку' button", () => {
      const updateSubscription = vi.fn();
      const setTxPicker = vi.fn();
      const subscriptions = [{ id: "s1", name: "Netflix", linkedTxId: "e1" }];
      render(
        <AssetsTxPickerView
          {...baseProps()}
          setTxPicker={setTxPicker}
          subscriptions={subscriptions as never}
          updateSubscription={updateSubscription}
          transactions={[mkTx({ id: "e1", amount: -4000 })]}
          txPicker={{ type: "sub", subId: "s1" }}
        />,
      );
      fireEvent.click(screen.getByText(/Зняти/));
      expect(updateSubscription).toHaveBeenCalledWith("s1", {
        linkedTxId: null,
      });
      expect(setTxPicker).toHaveBeenCalledWith(null);
    });
  });

  describe("debt / receivable mode", () => {
    it("renders only a back button when the item is not found", () => {
      render(
        <AssetsTxPickerView
          {...baseProps()}
          txPicker={{ type: "debt", id: "missing" }}
        />,
      );
      expect(screen.getByText("Назад")).toBeInTheDocument();
    });

    it("renders a debt header and opens the role picker on tap", () => {
      const setLinkedTxRole = vi.fn();
      const manualDebts = [
        {
          id: "d1",
          name: "Борг другу",
          emoji: "💸",
          amount: 10000,
          linkedTxIds: ["tx-1"],
        },
      ];
      render(
        <AssetsTxPickerView
          {...baseProps()}
          manualDebts={manualDebts as never}
          transactions={[mkTx({ id: "tx-1", amount: -2000 })]}
          setLinkedTxRole={setLinkedTxRole}
          txPicker={{ type: "debt", id: "d1" }}
        />,
      );
      expect(screen.getByText("Транзакції по пасиву")).toBeInTheDocument();
      expect(screen.getByText(/Борг другу/)).toBeInTheDocument();
      fireEvent.click(screen.getByText("Магазин"));
      // Тап більше не привʼязує напряму — спершу питаємо роль.
      expect(setLinkedTxRole).not.toHaveBeenCalled();
      expect(screen.getByText("Чим є ця операція?")).toBeInTheDocument();
      fireEvent.click(screen.getByText(/Збільшення боргу/));
      expect(setLinkedTxRole).toHaveBeenCalledWith(
        "d1",
        "tx-1",
        "debt",
        "increase",
        20,
      );
    });

    it("renders a receivable header with the active-asset wording", () => {
      const receivables = [
        {
          id: "r1",
          name: "Позика колезі",
          emoji: "🤝",
          amount: 8000,
          linkedTxIds: [],
        },
      ];
      render(
        <AssetsTxPickerView
          {...baseProps()}
          receivables={receivables as never}
          transactions={[mkTx({ id: "tx-1", amount: 1500 })]}
          txPicker={{ type: "recv", id: "r1" }}
        />,
      );
      expect(screen.getByText("Транзакції по активу")).toBeInTheDocument();
      expect(screen.getByText(/Позика колезі/)).toBeInTheDocument();
    });
  });

  it("masks amounts when showBalance is false", () => {
    render(
      <AssetsTxPickerView
        {...baseProps()}
        showBalance={false}
        transactions={[mkTx()]}
        monoDebtLinkedTxIds={{}}
        txPicker={{ type: "monoDebt", id: "acc-1" }}
      />,
    );
    const maskedAmounts = screen.getAllByRole("button", {
      name: /Прихована сума, натисни, щоб показати/,
    });
    expect(maskedAmounts.length).toBeGreaterThan(0);
    expect(maskedAmounts[0]).toHaveStyle({ filter: "blur(5px)" });
  });
});
