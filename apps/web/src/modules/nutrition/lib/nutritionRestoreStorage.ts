/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Аудит 2026-10-01, data-35: пакетні dual-write записи для відновлення
 * резервної копії Їжі. Окремо від `nutritionStorage.ts` (там `persist*` на
 * одну дію користувача, файл на межі `max-lines`, Hard Rule #18).
 *
 * Чому не цикл `upsertNutritionRecipe`: кожен його виклик диффить проти
 * ЩЕ НЕ оновленого кешу, тож N викликів дали б N×(розмір книги) ops. Тут одна
 * зміна стану на всю секцію - один `triggerNutritionDualWrite`.
 */
import type { NutritionGoalPeriodRestoreSnapshot } from "./sqliteWriter/diff.js";
import { triggerNutritionDualWrite } from "./sqliteWriter/index.js";
import {
  peekNutritionDualWriteState,
  recipeSnapshot,
} from "./nutritionStorage.js";
import type { SavedRecipe } from "./recipeBook.js";

/**
 * `replace`: книга стає рівно `recipes` (відсутні у файлі видаляються);
 * інакше `recipes` додаються до наявної книги за id, решта не чіпається.
 */
export function restoreNutritionRecipes(
  recipes: readonly SavedRecipe[],
  replace: boolean,
): boolean {
  const prev = peekNutritionDualWriteState();
  if (prev === null) return true;
  const incoming = recipes.map(recipeSnapshot);
  const ids = new Set(incoming.map((r) => r.id));
  const kept = replace ? [] : prev.recipes.filter((r) => !ids.has(r.id));
  triggerNutritionDualWrite(prev, {
    ...prev,
    recipes: [...kept, ...incoming],
  });
  return true;
}

/**
 * Дописує сходинки журналу цілей з файлу (`INSERT OR IGNORE` за `id`).
 * Журнал append-only: наявні сходинки не змінюються й не видаляються.
 */
export function appendRestoredNutritionGoalPeriods(
  periods: readonly NutritionGoalPeriodRestoreSnapshot[],
): boolean {
  if (periods.length === 0) return true;
  const prev = peekNutritionDualWriteState();
  if (prev === null) return true;
  triggerNutritionDualWrite(prev, { ...prev, goalPeriodRestores: periods });
  return true;
}
