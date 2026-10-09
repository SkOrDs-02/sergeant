/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Розбір і валідація полів КБЖВ форми прийому (винесено з `AddMealSheet`,
 * щоб файл не перевищував ліміт Hard Rule #18).
 */
import { parseDecimalInput } from "@shared/lib/format/numberInput";
import type { MealFormState } from "./mealFormUtils";

/**
 * Фізіологічно правдоподібні стелі для одного прийому їжі. Не медичні
 * норми — межі проти друкарської помилки й свідомо абсурдного вводу
 * (кома замість крапки, зайвий нуль), які інакше зламали б денні
 * агрегації та графіки.
 */
export const MAX_KCAL_PER_MEAL = 10_000;
export const MAX_MACRO_GRAMS = 2_000;

type MacroFormFields = Pick<
  MealFormState,
  "kcal" | "protein_g" | "fat_g" | "carbs_g"
>;

interface ParsedMacros {
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
}

/**
 * `parseDecimalInput`, а не `Number()`: поля мають `inputMode="decimal"`,
 * і українська (як і більшість європейських) розкладка дає кому —
 * `Number("1212,1")` це `NaN`, тож коректний ввід відхилявся.
 * Порожнє поле лишається `null` («не вказано»), і це НЕ помилка.
 */
export function parseMealMacroInputs(
  form: MacroFormFields,
): { ok: true; macros: ParsedMacros } | { ok: false; err: string } {
  const keys = ["kcal", "protein_g", "fat_g", "carbs_g"] as const;
  const inputs = keys.map((key) =>
    form[key] === "" ? null : parseDecimalInput(form[key]),
  );
  if (inputs.some((m) => m != null && !m.ok)) {
    return {
      ok: false,
      err: "Некоректне значення КБЖВ. Впиши число, наприклад 12,5.",
    };
  }
  const [kcal, protein_g, fat_g, carbs_g] = inputs.map((m) =>
    m != null && m.ok ? m.value : null,
  ) as [number | null, number | null, number | null, number | null];
  if (kcal != null && kcal > MAX_KCAL_PER_MEAL) {
    return {
      ok: false,
      err: `Забагато калорій: максимум ${MAX_KCAL_PER_MEAL} ккал на прийом. Зменш значення або розбий на кілька прийомів.`,
    };
  }
  if (
    [protein_g, fat_g, carbs_g].some((n) => n != null && n > MAX_MACRO_GRAMS)
  ) {
    return {
      ok: false,
      err: `Забагато БЖВ: максимум ${MAX_MACRO_GRAMS} г на прийом. Зменш значення.`,
    };
  }
  return { ok: true, macros: { kcal, protein_g, fat_g, carbs_g } };
}

/**
 * True when every macro field is null or 0 — mirrors the `hasPhotoMacros`
 * predicate in `AddMealSheet` (photo AI returns all-null macros when it
 * can't identify the food). A meal saved with all-empty macros won't move
 * the daily stats at all, so `handleSave` routes through a confirm step
 * instead of blocking the save outright (founder decision: warn, don't
 * block).
 */
export function macrosAreAllEmpty(macros: ParsedMacros): boolean {
  return !Object.values(macros).some((v) => v != null && v !== 0);
}

/** Підпис обраного продукту: «назва бренд», порожній без продукту. */
export function pickedFoodLabel(
  food: { name?: string | undefined; brand?: string | undefined } | null,
): string {
  if (!food) return "";
  return [food.name, food.brand].filter(Boolean).join(" ").trim();
}

/**
 * Форма без полів, засіяних джерелом: КБЖВ чистяться завжди, назва — лише
 * якщо вона дослівно та, що записало джерело (`seededName`), а не набрана
 * людиною. Тип прийому й час не чіпаємо: їх обирає людина.
 */
export function withoutSeededFields<
  T extends MacroFormFields & { name: string; err: string },
>(form: T, seededName: string | null): T {
  return {
    ...form,
    name: seededName !== null && form.name !== seededName ? form.name : "",
    kcal: "",
    protein_g: "",
    fat_g: "",
    carbs_g: "",
    err: "",
  };
}
