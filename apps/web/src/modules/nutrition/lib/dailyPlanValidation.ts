/**
 * Last validated: 2026-06-15
 * Status: Active
 * Web-shim over `@sergeant/nutrition-domain/daily-plan-validation`.
 *
 * Pure-логіка (`GOAL_BOUNDS`, `calcMacroKcalMismatch`, базовий
 * `calcGoalRangeIssues`) тепер живе в `@sergeant/nutrition-domain`, щоб
 * mobile-клієнт ділив ту саму перевірку. Цей файл лишається тільки як
 * web-i18n-обгортка: домен повертає структуровані `field`/`kind`-issues
 * без тексту, а тут ми додаємо локалізоване повідомлення з
 * `messages.nutritionGoalRange` для UI-консьюмера (`DailyPlanWarnings`).
 *
 * Mobile робить аналогічний мапінг у власному i18n-словнику.
 */
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import {
  calcGoalRangeIssues as calcDomainGoalRangeIssues,
  type GoalRangeIssue as DomainGoalRangeIssue,
} from "@sergeant/nutrition-domain";
import { messages } from "@shared/i18n/uk";

export { GOAL_BOUNDS, calcMacroKcalMismatch } from "@sergeant/nutrition-domain";
export type { GoalRangeField, GoalRangeKind } from "@sergeant/nutrition-domain";

export interface GoalRangeIssue extends DomainGoalRangeIssue {
  message: string;
}

function messageFor(issue: DomainGoalRangeIssue): string {
  const RANGE_COPY = messages.nutritionGoalRange;
  if (issue.field === "kcal") {
    return issue.kind === "low"
      ? RANGE_COPY.kcalTooLow
      : RANGE_COPY.kcalTooHigh;
  }
  if (issue.field === "protein_g") {
    return issue.kind === "low"
      ? RANGE_COPY.proteinTooLow
      : RANGE_COPY.proteinTooHigh;
  }
  if (issue.field === "fat_g") {
    return issue.kind === "low" ? RANGE_COPY.fatTooLow : RANGE_COPY.fatTooHigh;
  }
  // carbs has no "low" bound — only the "high" case fires from the domain.
  return RANGE_COPY.carbsTooHigh;
}

export function calcGoalRangeIssues(prefs: NutritionPrefs): GoalRangeIssue[] {
  return calcDomainGoalRangeIssues(prefs).map((issue) => ({
    ...issue,
    message: messageFor(issue),
  }));
}
