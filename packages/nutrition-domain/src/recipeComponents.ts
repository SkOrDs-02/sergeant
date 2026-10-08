/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Склад рецепта зі знімком продукту: КБЖВ рецепта рахується з інгредієнтів,
 * а не вводиться руками (канон nutrition.md § 6, «Борщ-проблема»).
 */
import type { NullableMacros } from "@sergeant/shared";

export interface RecipeComponent {
  name: string;
  grams: number;
  foodId: string | null;
  /** Копія КБЖВ на 100 г на момент додавання: правка бази не зсуває рецепт. */
  per100: NullableMacros;
}

const FIELDS = ["kcal", "protein_g", "fat_g", "carbs_g"] as const;

const NULL_MACROS: NullableMacros = {
  kcal: null,
  protein_g: null,
  fat_g: null,
  carbs_g: null,
};

/**
 * Сума `per100 × grams / 100`. Поле `null`, якщо воно `null` хоч в одного
 * компонента: невідомий жир олії не можна мовчки рахувати нулем.
 * Без округлення, його робить відображення.
 */
export function computeRecipeTotal(
  components: readonly RecipeComponent[],
): NullableMacros {
  if (components.length === 0) return { ...NULL_MACROS };
  const total: NullableMacros = { ...NULL_MACROS };
  for (const f of FIELDS) {
    let sum = 0;
    let known = true;
    for (const c of components) {
      const v = c.per100[f];
      if (v == null) {
        known = false;
        break;
      }
      sum += (v * c.grams) / 100;
    }
    total[f] = known ? sum : null;
  }
  return total;
}

function scaleBy(m: NullableMacros, k: number): NullableMacros {
  return {
    kcal: m.kcal == null ? null : m.kcal * k,
    protein_g: m.protein_g == null ? null : m.protein_g * k,
    fat_g: m.fat_g == null ? null : m.fat_g * k,
    carbs_g: m.carbs_g == null ? null : m.carbs_g * k,
  };
}

export function computeRecipePerServing(
  components: readonly RecipeComponent[],
  servings: number,
): NullableMacros {
  if (!(servings > 0)) return { ...NULL_MACROS };
  return scaleBy(computeRecipeTotal(components), 1 / servings);
}

/**
 * КБЖВ на 100 г ГОТОВОЇ страви: від введеної ваги, а не від суми сирих грамів
 * (вода випаровується або вбирається). Без ваги все `null`.
 */
export function computeRecipePer100(
  components: readonly RecipeComponent[],
  cookedWeightG: number | null | undefined,
): NullableMacros {
  if (cookedWeightG == null || !(cookedWeightG > 0)) return { ...NULL_MACROS };
  return scaleBy(computeRecipeTotal(components), 100 / cookedWeightG);
}
