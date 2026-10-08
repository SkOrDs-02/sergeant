/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Чернетка власного продукту й валідація, спільні для кроку «З упаковки»
 * (`PackageEntryStep`) і форми редагування в «Мої продукти»: два місця з
 * власною валідацією розійшлись би з першою ж правкою.
 */
import { generatePrefixedId } from "@sergeant/shared";
import { parseDecimalInput } from "@shared/lib/format/numberInput";
import {
  PORTION_NAME_MAX_LEN,
  type FoodPortion,
} from "../../lib/foodDb/foodDb";
import { MAX_PORTION_GRAMS } from "./mealFormUtils";

export const MAX_PORTIONS_PER_FOOD = 8;

export interface PortionDraft {
  id: string;
  name: string;
  grams: string;
}

export interface FoodDraft {
  name: string;
  kcal: string;
  protein_g: string;
  fat_g: string;
  carbs_g: string;
  portions: PortionDraft[];
}

export const EMPTY_FOOD_DRAFT: FoodDraft = {
  name: "",
  kcal: "",
  protein_g: "",
  fat_g: "",
  carbs_g: "",
  portions: [],
};

export function newPortionDraft(): PortionDraft {
  return { id: generatePrefixedId("portion"), name: "", grams: "" };
}

export function portionsToDrafts(portions: FoodPortion[]): PortionDraft[] {
  return portions.map((p) => ({
    id: p.id,
    name: p.name,
    grams: String(p.grams),
  }));
}

export interface PortionsValidation {
  portions: FoodPortion[];
  /** Помилки по id рядка. */
  errors: Record<string, string>;
  /** Помилка всього блоку (стеля кількості). */
  limitError: string;
}

/**
 * Порожній рядок (обидва поля порожні) мовчки відкидається; половинчастий,
 * з недійсними грамами чи дублем назви (без урахування регістру) дає
 * помилку біля рядка.
 */
export function validatePortions(rows: PortionDraft[]): PortionsValidation {
  const portions: FoodPortion[] = [];
  const errors: Record<string, string> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    const name = row.name.trim();
    const gramsRaw = row.grams.trim();
    if (!name && !gramsRaw) continue;
    if (!name || !gramsRaw) {
      errors[row.id] = "Заповни назву й грами або прибери рядок.";
      continue;
    }
    const grams = parseDecimalInput(gramsRaw);
    if (!grams.ok || grams.value <= 0 || grams.value > MAX_PORTION_GRAMS) {
      errors[row.id] = `Грами: число більше 0 і до ${MAX_PORTION_GRAMS}.`;
      continue;
    }
    if (name.length > PORTION_NAME_MAX_LEN) {
      errors[row.id] = `Назва: до ${PORTION_NAME_MAX_LEN} символів.`;
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      errors[row.id] = "Порція з такою назвою вже є.";
      continue;
    }
    seen.add(key);
    portions.push({ id: row.id, name, grams: grams.value });
  }
  const limitError =
    portions.length > MAX_PORTIONS_PER_FOOD
      ? `Максимум ${MAX_PORTIONS_PER_FOOD} порцій на продукт.`
      : "";
  return { portions, errors, limitError };
}

export type FoodDraftValidation =
  | {
      ok: true;
      name: string;
      per100: {
        kcal: number;
        protein_g: number;
        fat_g: number;
        carbs_g: number;
      };
      portions: FoodPortion[];
      /** Вага «Скільки зʼїв», якщо її передали на перевірку. */
      serving: number | null;
    }
  | { ok: false; error: string; portionErrors: Record<string, string> };

const fail = (
  error: string,
  portionErrors: Record<string, string> = {},
): FoodDraftValidation => ({ ok: false, error, portionErrors });

/**
 * `serving` - необовʼязкове поле ваги з кроку «З упаковки»; на формі
 * редагування його немає, тоді повідомлення про КБЖВ не згадує вагу.
 */
export function validateFoodDraft(
  draft: FoodDraft,
  serving?: string,
): FoodDraftValidation {
  const name = draft.name.trim();
  if (!name) return fail("Введи назву продукту.");
  const macros = (["kcal", "protein_g", "fat_g", "carbs_g"] as const).map(
    (key) =>
      draft[key] === ""
        ? { ok: true as const, value: 0 }
        : parseDecimalInput(draft[key]),
  );
  const servingParsed =
    serving === undefined ? null : parseDecimalInput(serving);
  if (
    macros.some((m) => !m.ok) ||
    (servingParsed && (!servingParsed.ok || servingParsed.value <= 0))
  ) {
    return fail(
      servingParsed
        ? "Введи невідʼємні КБЖВ на 100 г і додатну вагу порції."
        : "Введи невідʼємні КБЖВ на 100 г.",
    );
  }
  // Верхня межа мусить стояти і тут: вага їде прямо в `pickedGrams` і в
  // `amount_g`, а клемп у картці ловить лише набране в ній самій.
  if (
    servingParsed &&
    servingParsed.ok &&
    servingParsed.value > MAX_PORTION_GRAMS
  ) {
    return fail(`Забагато: максимум ${MAX_PORTION_GRAMS} г на порцію.`);
  }
  const portions = validatePortions(draft.portions);
  if (Object.keys(portions.errors).length > 0) {
    return fail("Виправ порції, підсвічені нижче.", portions.errors);
  }
  if (portions.limitError) return fail(portions.limitError);
  const [kcal, protein_g, fat_g, carbs_g] = macros.map((m) =>
    m.ok ? m.value : 0,
  ) as [number, number, number, number];
  return {
    ok: true,
    name,
    per100: { kcal, protein_g, fat_g, carbs_g },
    portions: portions.portions,
    serving: servingParsed && servingParsed.ok ? servingParsed.value : null,
  };
}
