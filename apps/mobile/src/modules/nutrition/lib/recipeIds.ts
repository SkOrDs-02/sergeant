/**
 * Реекспорт stable-recipe-id з `@sergeant/nutrition-domain` (паритет із
 * `apps/web/src/modules/nutrition/lib/recipeIds.ts`).
 *
 * `stableRecipeId` хешує title + інгредієнти + кроки одним FNV-1a — той
 * самий алгоритм на web і mobile, тож AI-рецепт отримує однаковий
 * `rcp_ai_*` id на обох платформах. Це критично для export/import: id не
 * розходяться між пристроями.
 */
export { stableRecipeId } from "@sergeant/nutrition-domain";
export type { StableRecipeIdInput } from "@sergeant/nutrition-domain";
