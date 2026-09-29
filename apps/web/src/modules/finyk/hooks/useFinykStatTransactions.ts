/**
 * Last validated: 2026-09-25
 * Status: Active
 */
import { useMemo } from "react";
import { getVisibleFinykMonoMirrorState } from "../lib/monoMirrorReader";
import { useFinykMonoMirrorTick } from "../lib/monoMirrorGate";
import { useFinykStorageSlots } from "./useFinykStorageSlots";
import {
  filterStatTransactions,
  withManualExpenses,
} from "@sergeant/finyk-domain/domain/transactions";
import { buildFinykExcludedTxIds } from "@sergeant/finyk-domain/utils";

/** Банківська історія з SQLite-дзеркала, реактивна до його оновлень. */
export function useFinykMirrorTransactions() {
  const mirrorTick = useFinykMonoMirrorTick();
  return useMemo(() => {
    void mirrorTick; // mirror cache refresh tick
    return getVisibleFinykMonoMirrorState().transactions;
  }, [mirrorTick]);
}

/**
 * Транзакції, які рахує статистика поза модулем (хаб): SQLite-дзеркало
 * банку плюс ручні записи, без прихованих, переказів, дебіторки і явно
 * виключених. Реактивне до оновлень дзеркала.
 *
 * CALC-2 (2026-09-01 product audit): фільтр лише за `excludedStatTxIds`
 * пропускав приховані записи й перекази, і вони будили хаб-інсайти.
 * `buildFinykExcludedTxIds` дає той самий набір, що Огляд, Операції й чат.
 * `mergedTransactions` уже несе ручні записи, тож годиться і як вхід
 * перевірки переказів.
 */
export function useFinykStatTransactions() {
  const transactions = useFinykMirrorTransactions();
  const slots = useFinykStorageSlots();
  // Дзеркало Mono несе тільки банк. Ручні витрати лежать у storage-слотах,
  // і без них хабова плашка мовчала б про готівку, яку модульний Огляд уже
  // рахує (браузерна перевірка 2026-08-31).
  const mergedTransactions = useMemo(
    () => withManualExpenses(transactions, slots.manualExpenses),
    [transactions, slots.manualExpenses],
  );
  const statTransactions = useMemo(
    () =>
      filterStatTransactions(
        mergedTransactions,
        buildFinykExcludedTxIds({
          hiddenTxIds: slots.hiddenTxIds,
          txCategories: slots.txCategories,
          receivables: slots.receivables,
          excludedStatTxIds: slots.excludedStatTxIds,
          transactions: mergedTransactions,
        }),
      ),
    [
      mergedTransactions,
      slots.hiddenTxIds,
      slots.txCategories,
      slots.receivables,
      slots.excludedStatTxIds,
    ],
  );
  return { statTransactions, slots };
}
