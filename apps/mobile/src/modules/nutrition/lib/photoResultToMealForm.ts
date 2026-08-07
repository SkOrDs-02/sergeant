import type { NutritionPhotoResult } from "@sergeant/api-client";
import { mealTypeByNow } from "@sergeant/nutrition-domain";

import type { MealFormState } from "../components/meal-sheet/mealFormUtils";
import { currentTime } from "../components/meal-sheet/mealFormUtils";

/**
 * Текст відмови, коли сервер повернув `isFood: false`.
 *
 * Копія повідомлення веб-картки (`PhotoAnalyzeCard` → `NotFoodNotice`) — обидві
 * поверхні мають казати людині те саме, бо причина відмови серверна й спільна.
 */
export function notFoodMessage(dishName?: string | null): string {
  const what = (dishName || "").trim();
  return what
    ? `Не бачу тут страви: на фото схоже на «${what}». Спробуй інше фото або введи КБЖВ вручну.`
    : "Не бачу тут страви. Спробуй інше фото або введи КБЖВ вручну.";
}

/** Мапінг відповіді analyze-photo → поля кроку «fill» AddMealSheet. */
export function mapPhotoResultToMealForm(
  result: NutritionPhotoResult,
): Pick<
  MealFormState,
  | "name"
  | "mealType"
  | "kcal"
  | "protein_g"
  | "fat_g"
  | "carbs_g"
  | "err"
  | "time"
> {
  const m = result.macros;
  const kcal =
    m.kcal != null && Number.isFinite(m.kcal) ? Math.round(m.kcal) : null;
  const p =
    m.protein_g != null && Number.isFinite(m.protein_g)
      ? Math.round(m.protein_g)
      : null;
  const f =
    m.fat_g != null && Number.isFinite(m.fat_g) ? Math.round(m.fat_g) : null;
  const c =
    m.carbs_g != null && Number.isFinite(m.carbs_g)
      ? Math.round(m.carbs_g)
      : null;

  const lowConf = (result.confidence ?? 0) < 0.4;
  const hasQuestions =
    Array.isArray(result.questions) && result.questions.length > 0;
  const err =
    lowConf || hasQuestions
      ? "AI оцінив приблизно. Перевір назву та КБЖВ (можливі уточнення в веб-версії — refine)."
      : "";

  return {
    name: (result.dishName || "").trim() || "Страва з фото",
    mealType: mealTypeByNow(),
    time: currentTime(),
    kcal: kcal != null ? String(kcal) : "",
    protein_g: p != null ? String(p) : "",
    fat_g: f != null ? String(f) : "",
    carbs_g: c != null ? String(c) : "",
    err,
  };
}
