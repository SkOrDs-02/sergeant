/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Хук рядка «спишеться» для хаба (OD-26 Ф-4 (а)): що з запланованих
 * списань (підписки й погашення боргів) припадає на сьогодні й завтра.
 *
 * Працює поза змонтованим модулем Фініка, як і решта хабових читачів
 * (`readFinykStatsContext`): підписки, борги й ручні записи бере з
 * SQLite-кешу, банківські операції з дзеркала Monobank. Набір транзакцій
 * той самий, що в писача quick-stats (`useFinykQuickStatsWriter`: банк +
 * ручні записи), тож рядок і «Можна сьогодні» бачать ті самі суми.
 * Перечитує при оновленні кешу, дзеркала і на київській півночі.
 */
import { useMemo } from "react";
import { manualExpenseToTransaction } from "@sergeant/finyk-domain/domain/transactions";
import { useKyivDayNow } from "@shared/hooks/useKyivDayNow";
import { getCachedFinykSqliteState } from "../lib/sqliteReader";
import { getVisibleFinykMonoMirrorState } from "../lib/monoMirrorReader";
import { useFinykSqliteReadTick } from "../lib/sqliteReadGate";
import { useFinykMonoMirrorTick } from "../lib/monoMirrorGate";
import { selectDueCharges, type DueCharge } from "../lib/dueCharges";

export type { DueCharge } from "../lib/dueCharges";
export { DUE_CHARGES_WINDOW_DAYS } from "../lib/dueCharges";

export function useFinykDueCharges(): DueCharge[] {
  const sqliteTick = useFinykSqliteReadTick();
  const mirrorTick = useFinykMonoMirrorTick();
  const nowMs = useKyivDayNow();
  return useMemo(() => {
    void sqliteTick;
    void mirrorTick;
    const cache = getCachedFinykSqliteState();
    const bankTx = getVisibleFinykMonoMirrorState().transactions;
    const manualTx = cache.manualExpenses.map((e) =>
      manualExpenseToTransaction(e),
    );
    return selectDueCharges({
      subscriptions: cache.subscriptions,
      manualDebts: cache.manualDebts,
      receivables: cache.receivables,
      transactions: manualTx.length > 0 ? [...bankTx, ...manualTx] : bankTx,
      nowMs,
    });
  }, [sqliteTick, mirrorTick, nowMs]);
}
