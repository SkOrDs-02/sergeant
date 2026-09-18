/**
 * Формат помилок AI-рекомендацій рецептів (mobile).
 *
 * Mirror `formatShoppingApiError` зі `Shopping.tsx`, але з окремими
 * текстами під recipe-flow. 402/429 трактуються як вичерпана AI-квота
 * (паритет із web `formatNutritionError`, який мапить quota-коди окремо).
 */
import { isApiError } from "@sergeant/api-client";

export function formatNutritionRecipeError(e: unknown): string {
  if (isApiError(e)) {
    if (e.status === 402 || e.status === 429) {
      return "Перевищено AI-квоту. Спробуй пізніше.";
    }
    if (e.kind === "network") {
      return "Немає звʼязку. Перевір інтернет і спробуй ще раз.";
    }
    return e.message || `Помилка ${e.status}`;
  }
  if (e instanceof Error) return e.message;
  return "Помилка рекомендацій рецептів.";
}
