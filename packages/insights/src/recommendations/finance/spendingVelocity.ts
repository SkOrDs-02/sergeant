// Rule: тренд витрат — цей тиждень vs минулий (нормалізуємо до того ж дня
// тижня). Спрацьовує тільки з середи (dowIdx ≥ 2), щоб не блимати у пн/вт
// з мінімумом даних.

import type { Rule } from "../types.js";
import { txTimestamp, type FinanceContext } from "../financeContext.js";

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 0=Mon
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

export const spendingVelocityRule: Rule<FinanceContext> = {
  id: "finyk.spending_velocity",
  module: "finyk",
  evaluate(ctx) {
    const now = ctx.now;
    const thisWeekStart = startOfWeek(now);
    const prevWeekStart = new Date(thisWeekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const dowIdx = (now.getDay() + 6) % 7;
    if (dowIdx < 2) return [];

    const sumSpending = (start: Date, end: Date): number => {
      let s = 0;
      for (const tx of ctx.transactions) {
        if (ctx.hiddenTxIds.has(tx.id) || ctx.transferIds.has(tx.id)) continue;
        if ((tx.amount ?? 0) >= 0) continue;
        const ts = txTimestamp(tx);
        if (ts >= start.getTime() && ts < end.getTime()) {
          s += Math.abs(tx.amount / 100);
        }
      }
      for (const me of ctx.manualExpenses) {
        const ts = new Date(me.date).getTime();
        if (ts >= start.getTime() && ts < end.getTime()) {
          s += Math.abs(Number(me.amount) || 0);
        }
      }
      return s;
    };

    const cmpEnd = new Date(thisWeekStart);
    cmpEnd.setDate(cmpEnd.getDate() + dowIdx + 1);
    const prevCmpEnd = new Date(prevWeekStart);
    prevCmpEnd.setDate(prevCmpEnd.getDate() + dowIdx + 1);
    const thisSpend = sumSpending(thisWeekStart, cmpEnd);
    const prevSpend = sumSpending(prevWeekStart, prevCmpEnd);
    if (prevSpend < 500 || thisSpend <= 0) return [];

    const ratio = thisSpend / prevSpend;
    if (ratio >= 1.4) {
      const pctMore = Math.round((ratio - 1) * 100);
      return [
        {
          id: "spending_velocity_high",
          module: "finyk" as const,
          priority: 75,
          icon: "trending-up",
          title: `Витрати на ${pctMore}% вище ніж минулого тижня`,
          body: `За такий же проміжок: ${Math.round(thisSpend).toLocaleString("uk-UA")} ₴ vs ${Math.round(prevSpend).toLocaleString("uk-UA")} ₴`,
          action: "finyk",
        },
      ];
    }
    if (ratio <= 0.6) {
      const pctLess = Math.round((1 - ratio) * 100);
      return [
        {
          id: "spending_velocity_low",
          module: "finyk" as const,
          priority: 45,
          icon: "award",
          title: `Витрати на ${pctLess}% нижче ніж минулого тижня`,
          body: `Чудовий темп: ${Math.round(thisSpend).toLocaleString("uk-UA")} ₴ vs ${Math.round(prevSpend).toLocaleString("uk-UA")} ₴`,
          action: "finyk",
        },
      ];
    }
    return [];
  },
};
