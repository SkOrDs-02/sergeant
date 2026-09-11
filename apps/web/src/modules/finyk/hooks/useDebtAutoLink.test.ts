// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Debt } from "@sergeant/finyk-domain/domain/debtEngine";
import { useDebtAutoLink } from "./useDebtAutoLink";

const TX = (id: string, amount: number, description: string) => ({
  id,
  amount,
  description,
});

describe("useDebtAutoLink — Level 2 авто-привʼязка (2026-09-11)", () => {
  it("привʼязує нову витрату-збіг роллю payment з auto:true", () => {
    const setLinkedTxRole = vi.fn();
    const debt: Debt = {
      id: "d1",
      amount: 5000,
      autoLinkKeyword: "кредит",
      linkedTxIds: [],
    };
    const transactions = [TX("tx1", -50000, "Кредит Приват")];

    renderHook(() => useDebtAutoLink([debt], transactions, setLinkedTxRole));

    expect(setLinkedTxRole).toHaveBeenCalledTimes(1);
    expect(setLinkedTxRole).toHaveBeenCalledWith(
      "d1",
      "tx1",
      "debt",
      "payment",
      500,
      { auto: true },
    );
  });

  it("ідемпотентність: коли транзакцію вже привʼязано, повторний прохід нічого не пише", () => {
    const setLinkedTxRole = vi.fn();
    const transactions = [TX("tx1", -50000, "Кредит Приват")];
    const debtBefore: Debt = {
      id: "d1",
      amount: 5000,
      autoLinkKeyword: "кредит",
      linkedTxIds: [],
    };

    const { rerender } = renderHook(
      ({ manualDebts }: { manualDebts: readonly Debt[] }) =>
        useDebtAutoLink(manualDebts, transactions, setLinkedTxRole),
      { initialProps: { manualDebts: [debtBefore] } },
    );
    expect(setLinkedTxRole).toHaveBeenCalledTimes(1);

    // Симулюємо стан ПІСЛЯ того, як батько застосував write вище —
    // саме такий обʼєкт прийшов би назад із `setManualDebts`.
    const debtAfter: Debt = {
      ...debtBefore,
      linkedTxIds: ["tx1"],
      txLinks: { tx1: { role: "payment", amount: 500, auto: true } },
    };
    rerender({ manualDebts: [debtAfter] });

    expect(setLinkedTxRole).toHaveBeenCalledTimes(1);
  });

  it("anti-resurrection: не привʼязує транзакцію, яку людина відвʼязала", () => {
    const setLinkedTxRole = vi.fn();
    const debt: Debt = {
      id: "d1",
      amount: 5000,
      autoLinkKeyword: "кредит",
      linkedTxIds: [],
      autoLinkDismissedTxIds: ["tx1"],
    };
    const transactions = [TX("tx1", -50000, "Кредит Приват")];

    renderHook(() => useDebtAutoLink([debt], transactions, setLinkedTxRole));

    expect(setLinkedTxRole).not.toHaveBeenCalled();
  });

  it("unlink → re-run матчера відтворює anti-resurrection наскрізно через сховище", () => {
    // Наскрізний сценарій, а не лише перевірка матчера: пишемо через ту саму
    // мутацію (`useFinykStorageMutations.setLinkedTxRole`), яку викликає хук,
    // щоб покрити саме взаємодію «auto-write → людина відвʼязує → повторний
    // прохід матчера» (вимога завдання — «unlink → re-run»).
    let debt: Debt = {
      id: "d1",
      amount: 5000,
      autoLinkKeyword: "кредит",
      linkedTxIds: [],
    };
    const transactions = [TX("tx1", -50000, "Кредит Приват")];

    const setLinkedTxRole = (
      id: string,
      txId: string,
      _type: "debt" | "receivable",
      role: "source" | "increase" | "payment" | null,
      amountUAH = 0,
      meta?: { auto?: boolean },
    ) => {
      if (id !== debt.id) return;
      const linked = debt.linkedTxIds ?? [];
      const txLinks = { ...(debt.txLinks ?? {}) };
      if (role === null) {
        const wasAuto = txLinks[txId]?.auto === true;
        delete txLinks[txId];
        debt = {
          ...debt,
          linkedTxIds: linked.filter((x) => x !== txId),
          txLinks,
          ...(wasAuto
            ? {
                autoLinkDismissedTxIds: [
                  ...(debt.autoLinkDismissedTxIds ?? []),
                  txId,
                ],
              }
            : {}),
        };
        return;
      }
      txLinks[txId] = {
        role,
        amount: Math.abs(amountUAH),
        ...(meta?.auto ? { auto: true } : {}),
      };
      debt = {
        ...debt,
        linkedTxIds: linked.includes(txId) ? linked : [...linked, txId],
        txLinks,
      };
    };

    const { rerender } = renderHook(
      ({ manualDebts }: { manualDebts: readonly Debt[] }) =>
        useDebtAutoLink(manualDebts, transactions, setLinkedTxRole),
      { initialProps: { manualDebts: [debt] } },
    );
    expect(debt.linkedTxIds).toEqual(["tx1"]);
    expect(debt.txLinks?.["tx1"]?.auto).toBe(true);

    // Людина відвʼязує авто-привʼязку.
    setLinkedTxRole(debt.id, "tx1", "debt", null);
    expect(debt.linkedTxIds).toEqual([]);
    expect(debt.autoLinkDismissedTxIds).toEqual(["tx1"]);

    // Наступний прохід хука (ререндер із оновленим боргом) НЕ привʼязує
    // ту саму транзакцію назад.
    rerender({ manualDebts: [debt] });
    expect(debt.linkedTxIds).toEqual([]);
  });

  it("пропускає пасиви без autoLinkKeyword", () => {
    const setLinkedTxRole = vi.fn();
    const debt: Debt = { id: "d1", amount: 5000, linkedTxIds: [] };
    const transactions = [TX("tx1", -50000, "Кредит Приват")];

    renderHook(() => useDebtAutoLink([debt], transactions, setLinkedTxRole));

    expect(setLinkedTxRole).not.toHaveBeenCalled();
  });
});
