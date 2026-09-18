// Rule: тренд витрат — цей тиждень vs минулий (нормалізуємо до того ж дня
// тижня). Спрацьовує тільки з середи (dowIdx ≥ 2), щоб не блимати у пн/вт
// з мінімумом даних.

import type { Rule } from "../types.js";
import {
  financeExcludedTxIds,
  type FinanceContext,
} from "../financeContext.js";
import { formatNumberUk, kyivMondayStartMs } from "@sergeant/shared";
import { calcFinykPeriodAggregate } from "@sergeant/finyk-domain/lib/spending";

// Фінансовий період — Kyiv-anchored (domain invariant, AGENTS.md § Domain
// invariants), не годинник пристрою.
function startOfWeek(d: Date): Date {
  return new Date(kyivMondayStartMs(d));
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

    const excludedTxIds = financeExcludedTxIds(ctx);

    // Банк — через канонічний агрегатор (враховує спліти й виключені id),
    // ручні витрати — окремо, calcFinykPeriodAggregate їх не бачить.
    const sumSpending = (start: Date, end: Date): number => {
      const bank = calcFinykPeriodAggregate(ctx.transactions, {
        start: start.getTime(),
        end: end.getTime(),
        excludedTxIds,
        txSplits: ctx.txSplits ?? {},
      }).totalSpent;
      let manual = 0;
      for (const me of ctx.manualExpenses) {
        const ts = new Date(me.date).getTime();
        if (ts >= start.getTime() && ts < end.getTime()) {
          manual += Math.abs(Number(me.amount) || 0);
        }
      }
      return bank + manual;
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
          body: `За такий же проміжок: ${formatNumberUk(Math.round(thisSpend))} ₴ vs ${formatNumberUk(Math.round(prevSpend))} ₴`,
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
          body: `Чудовий темп: ${formatNumberUk(Math.round(thisSpend))} ₴ vs ${formatNumberUk(Math.round(prevSpend))} ₴`,
          action: "finyk",
        },
      ];
    }
    return [];
  },
};
