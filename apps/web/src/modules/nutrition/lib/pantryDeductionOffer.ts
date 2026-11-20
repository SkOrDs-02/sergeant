/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Пропозиція «Списати 150 г із комори?» після запису страви (OD-27 Х-4 а,
 * рішення власника 2026-11-18, П-6 (А) і П-7 (Б)). Чисті правила: коли
 * пропонувати і що сказати. Тости й запис живуть у `useMealPantryOffer`.
 *
 * Пропонуємо лише коли:
 * - записано ОДИН рядок (фото з кількома позиціями не пропонує, П-7 Б);
 * - у рядка є вага, бо списуємо саме її;
 * - назва страви ТОЧНО збігається з назвою позиції комори (дефолт § 11.8:
 *   «збіг продукту точний за назвою»; регістр і пробіли не рахуються —
 *   той самий `matchFoodName`, за яким позицію знайде і саме списання);
 * - позиція має залишок і її одиниця переводиться з грамів. Упаковки
 *   (`уп`) не переводяться (`gramsToUnitQty` → `null`), тож їх не
 *   пропонуємо (дефолт § 11.8).
 *
 * `pantryDeductionOfferFor` чиста: без React і без сховища, тож її кличе і
 * шлях запису поза модулем (чат, `log_meal`). Комора на вході — усі місця
 * одним списком: `buildPlacedItems(loadPantries())`, як `pantryItems` у
 * `useNutritionPantries`.
 */
import {
  gramsToUnitQty,
  matchFoodName,
  type PantryItem,
} from "@sergeant/nutrition-domain";
import { formatPantryQty } from "./formatPantryQty";

export interface PantryDeductionOffer {
  /** Назва позиції комори, як вона там записана. */
  itemName: string;
  /** Скільки грамів списати: вага записаного рядка, ціла. */
  grams: number;
}

/** Записаний рядок журналу; `Meal` підходить як є. */
export interface PantryOfferMeal {
  name: string;
  /** Вага в грамах; невідома (`null` / відсутня) — пропозиції немає. */
  amount_g?: number | null | undefined;
}

export function pantryDeductionOfferFor(
  meals: readonly PantryOfferMeal[],
  items: readonly PantryItem[],
): PantryDeductionOffer | null {
  if (meals.length !== 1 || !Array.isArray(items)) return null;
  const meal = meals[0];
  if (!meal) return null;
  const grams = Math.round(Number(meal.amount_g));
  if (!Number.isFinite(grams) || grams <= 0) return null;
  const key = matchFoodName(meal.name);
  if (!key) return null;
  const item = items.find((x) => matchFoodName(x?.name) === key);
  if (!item) return null;
  const qty = Number(item.qty);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (gramsToUnitQty(grams, item.unit, item.name) == null) return null;
  return { itemName: item.name, grams };
}

export function pantryOfferMessage(grams: number): string {
  return `Списати ${grams}\u00a0г із комори?`;
}

/** Пояснення після «Скасувати» запису, чиє списання повернуто в комору. */
export function pantryReturnedMessage(
  deducted: number,
  unit: string | null,
): string {
  const qty = formatPantryQty(deducted, unit);
  return qty
    ? `Запис скасовано, ${qty} повернув у комору`
    : "Запис скасовано, списане повернув у комору";
}
