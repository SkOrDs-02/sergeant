// Rule: сьогоднішні витрати проти 7-денної середньої за день. Коли темп
// різко вищий, нагадуємо зафіксувати поточні витрати, поки памʼятаємо —
// найбільший fail-mode трекінгу в тому, що юзер «потім внесу» і забуває.
//
// Тригер:
//   • локальний час ≥ 14:00 (до обіду мало даних, зашумить);
//   • за попередні 7 повних днів сумарно ≥ 700 ₴ — інакше ratio нестабільне;
//   • сьогодні витрачено ≥ 200 ₴ — noise floor для дрібниць;
//   • today / avg_daily_prev7 ≥ 1.5.
//
// CTA: `pwaAction: "add_expense"` — шлях до manual-sheet одним тапом.

import type { Rule } from "../types.js";
import {
  financeExcludedTxIds,
  type FinanceContext,
} from "../financeContext.js";
import { formatNumberUk } from "@sergeant/shared";
import { calcFinykPeriodAggregate } from "@sergeant/finyk-domain/lib/spending";

const MIN_PREV7_SUM = 700;
const MIN_TODAY_SUM = 200;
const PACE_RATIO = 1.5;
const MIN_HOUR = 14;

export const dailyVsWeeklyPaceRule: Rule<FinanceContext> = {
  id: "finyk.daily_vs_weekly_pace",
  module: "finyk",
  evaluate(ctx) {
    const now = ctx.now;
    if (now.getHours() < MIN_HOUR) return [];

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekAgoStart = new Date(todayStart);
    weekAgoStart.setDate(weekAgoStart.getDate() - 7);

    const todayMs = todayStart.getTime();
    const weekAgoMs = weekAgoStart.getTime();
    const excludedTxIds = financeExcludedTxIds(ctx);

    // Банк — через канонічний агрегатор (враховує спліти й виключені id),
    // ручні витрати — окремо, calcFinykPeriodAggregate їх не бачить.
    const bankSpend = (start: number, end: number): number =>
      calcFinykPeriodAggregate(ctx.transactions, {
        start,
        end,
        excludedTxIds,
        txSplits: ctx.txSplits ?? {},
      }).totalSpent;

    let todayManual = 0;
    let prev7Manual = 0;
    for (const me of ctx.manualExpenses) {
      const ts = new Date(me.date).getTime();
      if (!Number.isFinite(ts)) continue;
      const abs = Math.abs(Number(me.amount) || 0);
      if (ts >= todayMs) todayManual += abs;
      else if (ts >= weekAgoMs) prev7Manual += abs;
    }

    const todaySpend = bankSpend(todayMs, Infinity) + todayManual;
    const prev7Spend = bankSpend(weekAgoMs, todayMs) + prev7Manual;

    if (prev7Spend < MIN_PREV7_SUM) return [];
    if (todaySpend < MIN_TODAY_SUM) return [];

    const avgDaily = prev7Spend / 7;
    if (avgDaily <= 0) return [];
    const ratio = todaySpend / avgDaily;
    if (ratio < PACE_RATIO) return [];

    const pctMore = Math.round((ratio - 1) * 100);
    return [
      {
        id: "finyk_daily_vs_weekly_pace",
        module: "finyk" as const,
        priority: 72,
        icon: "clock",
        title: `Сьогодні ${formatNumberUk(Math.round(todaySpend))} ₴, на ${pctMore}% вище середнього`,
        body: `7-денна середня: ${formatNumberUk(Math.round(avgDaily))} ₴/день. Зафіксуй поточні витрати, поки памʼятаєш.`,
        action: "finyk",
        pwaAction: "add_expense",
      },
    ];
  },
};
