// Rule: користувач має історію витрат, але давно нічого не логав. Треба
// нагадати зафіксувати свіжі витрати, щоб картина місяця не рвалась.
//
// Тригер:
//   • ≥5 записів expense за весь час (tx + manual) — щоб не шуміти у нових
//     юзерів, для яких є свої onboarding-правила;
//   • від останнього запису минуло ≥3 дні.
//
// CTA: `pwaAction: "add_expense"` — відкриває manual-expense-sheet у
// Фініку, не просто модуль.

import type { Rule } from "../types.js";
import { txTimestamp, type FinanceContext } from "../financeContext.js";
import { pluralDays } from "@sergeant/shared";

const MIN_HISTORY = 5;
const MIN_DAYS_SILENT = 3;

export const noTxRecentRule: Rule<FinanceContext> = {
  id: "finyk.no_tx_recent",
  module: "finyk",
  evaluate(ctx) {
    const times: number[] = [];
    for (const tx of ctx.transactions) {
      if (ctx.hiddenTxIds.has(tx.id) || ctx.transferIds.has(tx.id)) continue;
      if ((tx.amount ?? 0) >= 0) continue;
      times.push(txTimestamp(tx));
    }
    for (const me of ctx.manualExpenses) {
      const t = new Date(me.date).getTime();
      if (Number.isFinite(t)) times.push(t);
    }
    if (times.length < MIN_HISTORY) return [];

    const latest = Math.max(...times);
    const days = Math.floor((ctx.now.getTime() - latest) / 86_400_000);
    if (days < MIN_DAYS_SILENT) return [];

    return [
      {
        id: "finyk_no_tx_recent",
        module: "finyk" as const,
        priority: 68,
        icon: "pen",
        title: `${days} ${pluralDays(days)} без запису витрат`,
        body: "Зафіксуй найсвіжіші витрати, картина місяця буде точнішою.",
        action: "finyk",
        pwaAction: "add_expense",
      },
    ];
  },
};
