/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Власні продукти в бекапі Їжі. Окремо від `nutritionBackup.ts`: каталог живе в
 * IndexedDB, тож читання й запис async, а решта бекапу синхронна.
 */
import {
  importFoodsMissing,
  listUserFoods,
  type FoodProduct,
} from "../lib/foodDb/foodDb";

export function buildNutritionBackupFoods(): Promise<FoodProduct[]> {
  return listUserFoods();
}

/** Дописує `foods` у секцію `nutrition` вже зібраного Hub-бекапу. */
export async function withNutritionFoods<T extends { nutrition: unknown }>(
  hubPayload: T,
): Promise<T> {
  const nutrition = hubPayload.nutrition as { data?: object } | undefined;
  if (!nutrition?.data) return hubPayload;
  const foods = await buildNutritionBackupFoods();
  return {
    ...hubPayload,
    nutrition: { ...nutrition, data: { ...nutrition.data, foods } },
  };
}

/**
 * Відновлює `foods` з секції бекапу: продукт, чий `id` або назва вже є в базі,
 * пропускається, тож повторний імпорт не плодить дублів. Без поля `foods`
 * (бекап версії 1) нічого не робить.
 */
export async function applyNutritionBackupFoods(
  payload: unknown,
): Promise<void> {
  const data = (payload as { data?: { foods?: unknown } } | null)?.data;
  if (Array.isArray(data?.foods)) await importFoodsMissing(data.foods);
}
