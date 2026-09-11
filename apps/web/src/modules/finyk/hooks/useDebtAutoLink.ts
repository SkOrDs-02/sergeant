/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * Level 2 (рішення власника 2026-09-11, канон
 * `docs/product/modules/finyk.md` § Журнал рішень) — застосовує чистий
 * матчер `debtAutoLink.matchDebtAutoLinkTxIds` до реального стану: для
 * кожного пасиву з `autoLinkKeyword` знаходить нові витрати-збіги й
 * пише їх роллю `payment` із міткою `auto: true`.
 *
 * Ідемпотентність і відсутність циклу тримаються самим матчером, не цим
 * хуком: матчер виключає id, що вже в `linkedTxIds`, тож після запису
 * ефект перезапускається (бо `manualDebts` змінився), рахує матчі
 * знову — і для щойно привʼязаних id їх уже нема. Другий прохід нічого
 * не пише → рендер стабілізується за дві ітерації.
 *
 * Хук нічого не рендерить і не ходить у мережу — лише мутує вже
 * завантажений локальний стан. Тому підключати його варто там, де
 * `manualDebts` і `transactions` вже є в пам'яті (`useAssetsState`), а
 * не піднімати окремий fetch заради нього.
 */
import { useEffect } from "react";
import type {
  Debt,
  SetLinkedTxRole,
} from "@sergeant/finyk-domain/domain/debtEngine";
import {
  matchDebtAutoLinkTxIds,
  type AutoLinkableTx,
} from "@sergeant/finyk-domain/domain/debtAutoLink";

export function useDebtAutoLink(
  manualDebts: readonly Debt[],
  transactions: readonly AutoLinkableTx[],
  setLinkedTxRole: SetLinkedTxRole,
) {
  useEffect(() => {
    for (const debt of manualDebts) {
      if (!debt.autoLinkKeyword?.trim()) continue;
      const matchIds = matchDebtAutoLinkTxIds(debt, transactions);
      if (matchIds.length === 0) continue;
      const byId = new Map(transactions.map((tx) => [tx.id, tx]));
      for (const txId of matchIds) {
        const tx = byId.get(txId);
        if (!tx) continue;
        setLinkedTxRole(
          debt.id,
          txId,
          "debt",
          "payment",
          Math.abs(tx.amount / 100),
          {
            auto: true,
          },
        );
      }
    }
  }, [manualDebts, transactions, setLinkedTxRole]);
}
