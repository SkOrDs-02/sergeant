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
import { render, screen, fireEvent } from "@testing-library/react";
import { AssetsTxPickerView } from "./AssetsTxPickerView";
import type { TxRowTx } from "../components/TxRow";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";

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
    toggleLinkedTx: vi.fn(),
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
      const back = screen.getByText("← Назад");
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
  });

  describe("sub mode", () => {
    it("renders only a back button when the subscription is not found", () => {
      render(
        <AssetsTxPickerView
          {...baseProps()}
          txPicker={{ type: "sub", subId: "missing" }}
        />,
      );
      expect(screen.getByText("← Назад")).toBeInTheDocument();
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
      expect(screen.getByText("← Назад")).toBeInTheDocument();
    });

    it("renders a debt header and toggles a linked transaction", () => {
      const toggleLinkedTx = vi.fn();
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
          toggleLinkedTx={toggleLinkedTx}
          txPicker={{ type: "debt", id: "d1" }}
        />,
      );
      expect(screen.getByText("Транзакції по пасиву")).toBeInTheDocument();
      expect(screen.getByText(/Борг другу/)).toBeInTheDocument();
      fireEvent.click(screen.getByText("Магазин"));
      expect(toggleLinkedTx).toHaveBeenCalledWith("d1", "tx-1", "debt");
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
    expect(screen.getAllByText("••••").length).toBeGreaterThan(0);
  });
});
