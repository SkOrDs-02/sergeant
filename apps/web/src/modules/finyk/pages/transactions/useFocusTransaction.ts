/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Глибоке посилання `/finyk/transactions?tx=<id>` (Ф-2 (а), рішення власника
 * OD-26, 2026-11-18): хабовий пошук відкриває саму операцію, а не модуль.
 *
 * `manual_<id>` відкриває редагування ручного запису тим самим шляхом, що
 * тап по рядку; банківський id — аркуш деталей. Банківську операцію
 * шукаємо і в SQLite-дзеркалі, бо вона може бути з іншого місяця, ніж
 * показаний. Поки запис не знайдено (сховище ще гріється), параметр не
 * споживаємо: щойно дані доїдуть, ефект спрацює. Кожен id обробляється
 * один раз, тож повторний рендер з тим самим параметром аркуш не
 * перевідкриває.
 */
import { useEffect, useRef } from "react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import type { ManualExpense } from "@sergeant/finyk-domain/domain/personalization";
import {
  MANUAL_TX_KEY_PREFIX,
  rawManualId,
} from "@sergeant/finyk-domain/domain/debtLinkKeys";
import { useFinykMirrorTransactions } from "../../hooks/useFinykStatTransactions";

export interface UseFocusTransactionParams {
  focusTxId: string | null | undefined;
  realTx: readonly Transaction[];
  historyTx: readonly Transaction[];
  manualExpenses: readonly ManualExpense[] | undefined;
  openBankTransaction: (tx: Transaction) => void;
  openManualExpense: ((rawId: string) => void) | undefined;
  onConsumed: (() => void) | undefined;
}

export function useFocusTransaction({
  focusTxId,
  realTx,
  historyTx,
  manualExpenses,
  openBankTransaction,
  openManualExpense,
  onConsumed,
}: UseFocusTransactionParams): void {
  const mirrorTx = useFinykMirrorTransactions();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusTxId || handledRef.current === focusTxId) return;
    if (focusTxId.startsWith(MANUAL_TX_KEY_PREFIX)) {
      const raw = rawManualId(focusTxId);
      if (!openManualExpense) return;
      if (!(manualExpenses ?? []).some((e) => String(e.id) === raw)) return;
      handledRef.current = focusTxId;
      openManualExpense(raw);
      onConsumed?.();
      return;
    }
    const tx =
      realTx.find((t) => t.id === focusTxId) ??
      historyTx.find((t) => t.id === focusTxId) ??
      mirrorTx.find((t) => t.id === focusTxId);
    if (!tx) return;
    handledRef.current = focusTxId;
    openBankTransaction(tx);
    onConsumed?.();
  }, [
    focusTxId,
    realTx,
    historyTx,
    mirrorTx,
    manualExpenses,
    openBankTransaction,
    openManualExpense,
    onConsumed,
  ]);
}
