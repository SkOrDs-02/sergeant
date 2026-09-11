// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Debt } from "@sergeant/finyk-domain/domain/debtEngine";
import { useDebtPaymentSplitSync } from "./useDebtPaymentSplitSync";

const TX_ID = "bank-1";

const debtWithPayment = (amount = 300): Debt => ({
  id: "d1",
  amount: 5000,
  name: "Кредитка ПриватБанк",
  linkedTxIds: [TX_ID],
  txLinks: { [TX_ID]: { role: "payment", amount } },
});

function setup(debts: readonly Debt[] = [debtWithPayment()]) {
  const setLinkedTxRole = vi.fn();
  const toastSuccess = vi.fn();
  const view = renderHook(() =>
    useDebtPaymentSplitSync(debts, setLinkedTxRole, toastSuccess),
  );
  return { ...view, setLinkedTxRole, toastSuccess };
}

describe("useDebtPaymentSplitSync — рівень 3 (2026-09-11)", () => {
  it("частку боргу зменшено: сума оновлюється і про це видно тост", () => {
    const { result, setLinkedTxRole, toastSuccess } = setup();

    act(() => {
      result.current.reconcile(
        TX_ID,
        [
          { categoryId: "debt", amount: 150 },
          { categoryId: "food", amount: 850 },
        ],
        1000,
      );
    });

    expect(setLinkedTxRole).toHaveBeenCalledWith(
      "d1",
      TX_ID,
      "debt",
      "payment",
      150,
    );
    // Слід для людини обовʼязковий — саме він відрізняє рівень 3 від
    // мовчазного перерахунку.
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    const text = String(toastSuccess.mock.calls[0]?.[0] ?? "");
    expect(text).toContain("Кредитка ПриватБанк");
    expect(text).toContain("300");
    expect(text).toContain("150");
    expect(result.current.pendingUnlink).toBeNull();
  });

  it("спліт прибрано повністю: платіж повертається до повної суми", () => {
    const { result, setLinkedTxRole } = setup();

    act(() => {
      result.current.reconcile(TX_ID, null, 1000);
    });

    expect(setLinkedTxRole).toHaveBeenCalledWith(
      "d1",
      TX_ID,
      "debt",
      "payment",
      1000,
    );
  });

  it("сума не змінилась: ні запису, ні тосту", () => {
    const { result, setLinkedTxRole, toastSuccess } = setup();

    act(() => {
      result.current.reconcile(
        TX_ID,
        [
          { categoryId: "debt", amount: 300 },
          { categoryId: "food", amount: 700 },
        ],
        1000,
      );
    });

    expect(setLinkedTxRole).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("частки боргу не лишилось: питає і НЕ пише сама", () => {
    const { result, setLinkedTxRole, toastSuccess } = setup();

    act(() => {
      result.current.reconcile(
        TX_ID,
        [
          { categoryId: "food", amount: 850 },
          { categoryId: "transport", amount: 150 },
        ],
        1000,
      );
    });

    expect(setLinkedTxRole).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(result.current.pendingUnlink).toMatchObject({
      txId: TX_ID,
      debtId: "d1",
      debtName: "Кредитка ПриватБанк",
      previousAmountUAH: 300,
    });
  });

  it("підтвердження відвʼязує рівно один раз", () => {
    const { result, setLinkedTxRole } = setup();

    act(() => {
      result.current.reconcile(
        TX_ID,
        [{ categoryId: "food", amount: 1000 }],
        1000,
      );
    });
    act(() => {
      result.current.confirmUnlink();
    });

    expect(setLinkedTxRole).toHaveBeenCalledTimes(1);
    expect(setLinkedTxRole).toHaveBeenCalledWith("d1", TX_ID, "debt", null);
    expect(result.current.pendingUnlink).toBeNull();
  });

  it("відмова лишає привʼязку недоторканою", () => {
    const { result, setLinkedTxRole } = setup();

    act(() => {
      result.current.reconcile(
        TX_ID,
        [{ categoryId: "food", amount: 1000 }],
        1000,
      );
    });
    act(() => {
      result.current.dismissUnlink();
    });

    expect(setLinkedTxRole).not.toHaveBeenCalled();
    expect(result.current.pendingUnlink).toBeNull();
  });

  it("транзакція без привʼязки нічого не запускає", () => {
    const { result, setLinkedTxRole, toastSuccess } = setup([
      { id: "d1", amount: 5000, linkedTxIds: [] },
    ]);

    act(() => {
      result.current.reconcile(TX_ID, null, 1000);
    });

    expect(setLinkedTxRole).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(result.current.pendingUnlink).toBeNull();
  });
});
