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
 *
 * **Неоднозначність — привʼязка НІКОМУ (CodeRabbit finding #2, PR #1103).**
 * `matchDebtAutoLinkTxIds` бачить лише СВІЙ пасив, тож без окремого
 * проходу та сама транзакція, що збігається з ключовими словами двох
 * різних пасивів, писалася б роллю `payment` в обидва — і віднімалась
 * би від залишку обох. Тому матчі спершу рахуються для ВСІХ пасивів
 * одним проходом, і лише id, які не претендує більш ніж один пасив,
 * ідуть у запис. Транзакція, заявлена двома+ пасивами, лишається
 * непривʼязаною — і так до наступного проходу, доки людина не
 * розведе ключові слова або не привʼяже вручну: помилкове число,
 * подане як певність, гірше за непривʼязаний рядок.
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
    const perDebtMatches = manualDebts
      .filter((debt) => debt.autoLinkKeyword?.trim())
      .map((debt) => ({
        debt,
        matchIds: matchDebtAutoLinkTxIds(debt, transactions),
      }))
      .filter((entry) => entry.matchIds.length > 0);
    if (perDebtMatches.length === 0) return;

    // Той самий інваріант, але через ЧУЖУ привʼязку: `matchDebtAutoLinkTxIds`
    // виключає лише `linkedTxIds` ВЛАСНОГО пасиву, тож транзакція, уже
    // привʼязана (хоч руками) до боргу А, лишалась кандидатом для боргу Б.
    // Одна транзакція гасить максимум один борг — інакше та сама сума
    // віднімається двічі.
    const linkedElsewhere = new Set(
      manualDebts.flatMap((debt) => debt.linkedTxIds ?? []),
    );

    const claimCount = new Map<string, number>();
    for (const { matchIds } of perDebtMatches) {
      for (const txId of matchIds) {
        claimCount.set(txId, (claimCount.get(txId) ?? 0) + 1);
      }
    }

    const byId = new Map(transactions.map((tx) => [tx.id, tx]));
    for (const { debt, matchIds } of perDebtMatches) {
      for (const txId of matchIds) {
        if ((claimCount.get(txId) ?? 0) > 1) continue; // claimed by 2+ debts — link neither
        if (linkedElsewhere.has(txId)) continue; // вже гасить інший борг
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
