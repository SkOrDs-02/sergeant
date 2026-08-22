// Rule: прогрес фінансових цілей — повідомляємо коли до фінішу лишилось
// 20%. Працює з budget.type === "goal", порівнюючи saved/targetAmount.

import type { Rec, Rule } from "../types.js";
import type { FinanceContext } from "../financeContext.js";
import { formatNumberUk } from "@sergeant/shared";

interface GoalContribution {
  amountUah?: number;
}

interface Goal {
  id?: string;
  name?: string;
  type: string;
  targetAmount?: number;
  /** @deprecated лишено для старих снапшотів — не читається, лог поповнень зараз в `contributions`. */
  savedAmount?: number;
  contributions?: GoalContribution[];
}

// ponytail: FinanceContext не має балансу привʼязаної банки (goal-progress-
// auto-sync), тож тут рахуємо лише ручну частину прогресу (contributions).
// Ціль з привʼязаною банкою покаже трохи занижений прогрес у цій пораді,
// доки jar-баланс не протягнуть у FinanceContext — апгрейд, коли знадобиться.
function sumContributions(
  contributions: readonly GoalContribution[] | undefined,
): number {
  if (!Array.isArray(contributions)) return 0;
  return contributions.reduce((s, c) => s + (Number(c?.amountUah) || 0), 0);
}

export const goalProgressRule: Rule<FinanceContext> = {
  id: "finyk.goal_progress",
  module: "finyk",
  evaluate(ctx) {
    const goals = ctx.budgets.filter((b) => b.type === "goal") as Goal[];
    const recs: Rec[] = [];
    for (const g of goals) {
      const target = Number(g.targetAmount) || 0;
      const saved =
        Array.isArray(g.contributions) && g.contributions.length > 0
          ? sumContributions(g.contributions)
          : Number(g.savedAmount) || 0;
      if (target <= 0 || saved <= 0) continue;
      const p = saved / target;
      if (p < 0.8 || p >= 1) continue;
      const remaining = target - saved;
      recs.push({
        id: `goal_almost_${g.id || g.name || "unnamed"}`,
        module: "finyk" as const,
        priority: 65,
        icon: "🎯",
        title: `Ціль "${g.name ?? ""}" майже досягнута`,
        body: `Залишилось ${formatNumberUk(Math.round(remaining))} ₴ (${Math.round(p * 100)}%)`,
        action: "finyk",
      });
    }
    return recs;
  },
};
