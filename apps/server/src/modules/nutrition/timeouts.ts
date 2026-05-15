/**
 * AI-call timeout budgets per nutrition feature.
 *
 * Tuned to model latency p95 + retry headroom. These were previously inline
 * magic numbers spread across the nutrition handlers; consolidated here so
 * bumps and audits live in one place. Track changes in
 * `docs/tech-debt/backend.md` when adjusting.
 */
export const NUTRITION_AI_TIMEOUTS_MS = {
  /** `day-plan.ts` — generate single day meal plan. */
  dayPlan: 30_000,
  /** `week-plan.ts` — generate weekly meal plan (longer model call). */
  weekPlan: 35_000,
  /** `recommend-recipes.ts` — recipe recommendations (largest budget). */
  recommendRecipes: 45_000,
  /** `shopping-list.ts` — derive shopping list from meal plan. */
  shoppingList: 25_000,
  /** `food-search.ts` — external food DB search via fetch. */
  foodSearch: 8_000,
} as const;
