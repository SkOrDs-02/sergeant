// Rule: тренд витрат — цей календарний тиждень (пн–нд за Києвом) проти того
// самого відрізка минулого: на початку тижня пн–ср стоять проти пн–ср, а не
// неповний тиждень проти повного (`weekSliceWindows`, рішення власника
// 2026-10-01, f1). Спрацьовує тільки з середи, щоб не блимати у пн/вт із
// мінімумом даних.

import type { Rule } from "../types.js";
import {
  financeExcludedTxIds,
  type FinanceContext,
} from "../financeContext.js";
import { formatNumberUk } from "@sergeant/shared";
import { calcFinykPeriodAggregate } from "@sergeant/finyk-domain/lib/spending";
import { weekSliceWindows } from "@sergeant/finyk-domain/domain/weekSlices";

/** Мінімум прожитих днів тижня (пн = 1), з якого порівняння має сенс: з середи. */
const MIN_DAYS_ELAPSED = 3;

export const spendingVelocityRule: Rule<FinanceContext> = {
  id: "finyk.spending_velocity",
  module: "finyk",
  evaluate(ctx) {
    const { daysElapsed, current, previous } = weekSliceWindows(ctx.now);
    if (daysElapsed < MIN_DAYS_ELAPSED) return [];

    const excludedTxIds = financeExcludedTxIds(ctx);

    // Банк — через канонічний агрегатор (враховує спліти й виключені id),
    // ручні витрати — окремо, calcFinykPeriodAggregate їх не бачить.
    const sumSpending = (startMs: number, endMs: number): number => {
      const bank = calcFinykPeriodAggregate(ctx.transactions, {
        start: startMs,
        end: endMs,
        excludedTxIds,
        txSplits: ctx.txSplits ?? {},
      }).totalSpent;
      let manual = 0;
      for (const me of ctx.manualExpenses) {
        const ts = new Date(me.date).getTime();
        if (ts >= startMs && ts < endMs) {
          manual += Math.abs(Number(me.amount) || 0);
        }
      }
      return bank + manual;
    };

    const thisSpend = sumSpending(current.startMs, current.endMs);
    const prevSpend = sumSpending(previous.startMs, previous.endMs);
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
