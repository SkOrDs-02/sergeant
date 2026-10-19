/**
 * «Готівка на руках» (ADR-0076, фаза 1 спеки `finyk-analytics-v3.md`).
 *
 * Хук тримає стан рахунку в слоті `cashOnHand` (він їде в
 * `finyk_prefs.prefs_json` тим самим dual-write, що й правила мерчантів) і
 * рахує з нього похідне: баланс і набір банківських знять, що стали
 * переказом на готівку. Сама арифметика живе в `finyk-domain/domain/cashOnHand`.
 */
import { useCallback, useMemo } from "react";
import {
  computeCashBalanceMinor,
  createCashOnHand,
  findCashTransferTxIds,
  toggleCashCountAsExpense,
  withCashAdjustment,
} from "@sergeant/finyk-domain/domain/cashOnHand";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { generatePrefixedId } from "@sergeant/shared";
import type { FinykStorageSlots } from "./useFinykStorageSlots";

export function useFinykCashOnHand(
  slots: Pick<
    FinykStorageSlots,
    "cashOnHand" | "setCashOnHand" | "manualExpenses"
  >,
  bankTxs: readonly Transaction[],
) {
  const { cashOnHand, setCashOnHand, manualExpenses } = slots;

  const cashBalanceMinor = useMemo(
    () =>
      computeCashBalanceMinor({ cash: cashOnHand, bankTxs, manualExpenses }),
    [cashOnHand, bankTxs, manualExpenses],
  );

  // Ключ-рядок замість Set у залежностях: дзеркало банку оновлюється після
  // кожного запиту, а набір знять майже ніколи не змінюється.
  const transferKey = useMemo(
    () =>
      JSON.stringify([...findCashTransferTxIds(bankTxs, cashOnHand)].sort()),
    [bankTxs, cashOnHand],
  );
  const cashTransferTxIds = useMemo(
    () => new Set<string>(JSON.parse(transferKey) as string[]),
    [transferKey],
  );

  const createCash = useCallback(
    (amountMinor: number) => {
      setCashOnHand(
        (prev) => prev ?? createCashOnHand(amountMinor, Date.now()),
      );
    },
    [setCashOnHand],
  );

  const setCashActualAmount = useCallback(
    (actualMinor: number) => {
      if (!cashOnHand || cashBalanceMinor === null) return;
      setCashOnHand(
        withCashAdjustment(
          cashOnHand,
          cashBalanceMinor,
          actualMinor,
          Date.now(),
          generatePrefixedId("cash"),
        ),
      );
    },
    [cashOnHand, cashBalanceMinor, setCashOnHand],
  );

  const toggleCashCountAsExpenseTx = useCallback(
    (txId: string) => {
      setCashOnHand((prev) =>
        prev ? toggleCashCountAsExpense(prev, txId) : prev,
      );
    },
    [setCashOnHand],
  );

  // Дефолт рахунку нового ручного запису (Р3.2); без змін стан не пишемо.
  const rememberManualAccount = useCallback(
    (account: "cash" | null) => {
      const prefer = account === "cash";
      setCashOnHand((prev) =>
        prev && prev.preferForManual !== prefer
          ? { ...prev, preferForManual: prefer }
          : prev,
      );
    },
    [setCashOnHand],
  );

  return {
    rememberManualAccount,
    cashOnHand,
    cashBalanceMinor,
    cashTransferTxIds,
    createCashOnHand: createCash,
    setCashActualAmount,
    toggleCashCountAsExpense: toggleCashCountAsExpenseTx,
  };
}
