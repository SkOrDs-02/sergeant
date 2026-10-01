// Реєстр правил модуля Finyk. Порядок у масиві — JUST for readability, фактичний
// порядок у UI диктується `priority`. Додавайте сюди нові правила, не пишіть
// інлайн-логіку у web-обгортку `recommendationEngine.buildFinanceRecs`.

import type { Rule } from "../types.js";
import type { FinanceContext } from "../financeContext.js";
import { budgetLimitsRule } from "./budgetLimits.js";
import { spendingVelocityRule } from "./spendingVelocity.js";
import { frequentNoBudgetRule } from "./frequentNoBudget.js";
import { goalProgressRule } from "./goalProgress.js";
import { noTxRecentRule } from "./noTxRecent.js";
import { dailyVsWeeklyPaceRule } from "./dailyVsWeeklyPace.js";

export {
  DAILY_PACE_REC_ID,
  SPENDING_PACE_WARNING_REC_IDS,
  WEEKLY_PACE_HIGH_REC_ID,
  WEEKLY_PACE_LOW_REC_ID,
} from "./paceSignals.js";
export {
  evaluateDailyPace,
  type DailyPaceSignal,
} from "./dailyVsWeeklyPace.js";
export {
  budgetLimitsRule,
  spendingVelocityRule,
  frequentNoBudgetRule,
  goalProgressRule,
  noTxRecentRule,
  dailyVsWeeklyPaceRule,
};

export const FINANCE_RULES: readonly Rule<FinanceContext>[] = [
  budgetLimitsRule,
  spendingVelocityRule,
  frequentNoBudgetRule,
  goalProgressRule,
  noTxRecentRule,
  dailyVsWeeklyPaceRule,
];
