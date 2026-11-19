/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Пропозиція списати продукт із комори після запису їжі через чат (рішення
 * власника 2026-11-19, Б): «рядком у відповіді чату», згода наступною
 * реплікою, списання наявним `consume_from_pantry`. Нічого не спливає поверх
 * розмови, тож тут ні тосту, ні запису: лише факт для моделі.
 *
 * AI-CONTEXT: факт іде в дужках `(для моделі: …)`. Показ їх вирізає
 * (`chatDisplayText.ts`), тож людина бачить пропозицію лише словами моделі,
 * а не двічі. Ті самі дужки роблять результат «записом із технічними
 * даними» для `turnRefs.ts`, і наступний хід отримує назву позиції та `qty`
 * у блоці `[Записи з попередньої відповіді]`: на «так» модель бере аргументи
 * звідти, а не вгадує. Усередині дужок не може бути `)`: регулярка показу
 * обрізає по першій закривальній.
 *
 * `qty` — в одиницях позиції, як вимагає `consume_from_pantry` (комора в
 * кілограмах списує 0.15, а не 150). Правила «коли пропонувати» живуть у
 * модулі (`pantryDeductionOfferFor`): один рядок, є вага, точний збіг назви
 * за `matchFoodName`, одиниця переводиться з грамів.
 */
import { buildPlacedItems, gramsToUnitQty } from "@sergeant/nutrition-domain";
import { pantryDeductionOfferFor } from "../../../modules/nutrition/lib/pantryDeductionOffer";
import { loadPantries } from "../../../modules/nutrition/lib/nutritionStorage";

/** Вага з інпуту моделі: додатне число грамів або `null`. */
export function mealGramsFromInput(raw: unknown): number | null {
  const n = raw == null || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Хвіст результату `log_meal` з пропозицією або `""`, коли пропонувати нічого
 * (немає ваги, немає збігу, комора недоступна).
 */
export function pantryOfferHint(name: string, grams: number | null): string {
  if (grams == null) return "";
  const placed = buildPlacedItems(loadPantries());
  const offer = pantryDeductionOfferFor([{ name, amount_g: grams }], placed);
  if (!offer) return "";
  const item = placed.find((it) => it.name === offer.itemName);
  const qty = gramsToUnitQty(offer.grams, item?.unit, offer.itemName);
  if (qty == null) return "";
  const qtyArg = Math.round(qty * 1000) / 1000;
  return ` (для моделі: у коморі є «${offer.itemName}», запропонуй людині одним рядком списати ${offer.grams} г; якщо погодиться, виклич consume_from_pantry з name «${offer.itemName}» і qty ${qtyArg})`;
}
