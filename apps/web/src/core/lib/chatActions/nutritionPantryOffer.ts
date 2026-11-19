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
 * модулі (`pantryDeductionOfferFor`): один рядок, є вага, одиниця
 * переводиться з грамів.
 *
 * AI-CONTEXT: збіг назви в чаті ширший, ніж у формі їжі (рішення власника
 * 2026-11-19). Модель записує їжу описово («Варений рис»), тож спершу
 * точний збіг за `matchFoodName` (як у формі), а без нього збіг за словом:
 * усі слова назви позиції стоять у назві страви підряд і цілими словами
 * («Варений рис» → «Рис»; «Рисова локшина» і «Курка з рисом» → ні, без
 * стемінгу й відмінків), і така позиція в коморі ОДНА. Форма їжі лишається
 * з точним збігом (`pantryDeductionOfferFor`), тут його не змінюємо.
 */
import {
  buildPlacedItems,
  gramsToUnitQty,
  matchFoodName,
  type PantryItem,
} from "@sergeant/nutrition-domain";
import { pantryDeductionOfferFor } from "../../../modules/nutrition/lib/pantryDeductionOffer";
import { loadPantries } from "../../../modules/nutrition/lib/nutritionStorage";

/** Вага з інпуту моделі: додатне число грамів або `null`. */
export function mealGramsFromInput(raw: unknown): number | null {
  const n = raw == null || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Слова назви після нормалізації `matchFoodName`; розділювачі: пробіл, `,`, `;`. */
function foodWords(s: unknown): string[] {
  return matchFoodName(s)
    .split(/[\s,;]+/)
    .filter(Boolean);
}

/** Усі слова `needle` стоять у `haystack` підряд, цілими словами. */
function containsWordRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((w, j) => haystack[i + j] === w)) return true;
  }
  return false;
}

/**
 * Назва, за якою шукати позицію комори. Спершу точний збіг (`matchFoodName`):
 * є він — назва лишається як є. Інакше збіг за словом (рішення власника
 * 2026-11-19): позиція підходить, коли всі слова її назви стоять у назві
 * страви підряд і цілими словами; пропонуємо, лише якщо така позиція рівно
 * одна. Повертає точну назву позиції (її знайде `consume_from_pantry`) або
 * вихідну назву, коли збігу немає чи він неоднозначний.
 */
export function pantryOfferName(
  mealName: string,
  items: readonly PantryItem[],
): string {
  const key = matchFoodName(mealName);
  if (!key) return mealName;
  if (items.some((it) => matchFoodName(it?.name) === key)) return mealName;
  const mealWords = foodWords(mealName);
  const hits = items.filter((it) =>
    containsWordRun(mealWords, foodWords(it?.name)),
  );
  // Однозначність за РІЗНИМИ назвами: та сама позиція в двох місцях
  // зберігання це один збіг (як і для точного, `consume_from_pantry` бере
  // першу знайдену).
  const distinct = new Set(hits.map((it) => matchFoodName(it.name)));
  const first = distinct.size === 1 ? hits[0] : undefined;
  return first ? first.name : mealName;
}

/**
 * Хвіст результату `log_meal` з пропозицією або `""`, коли пропонувати нічого
 * (немає ваги, немає збігу, комора недоступна).
 */
export function pantryOfferHint(name: string, grams: number | null): string {
  if (grams == null) return "";
  const placed = buildPlacedItems(loadPantries());
  const offer = pantryDeductionOfferFor(
    [{ name: pantryOfferName(name, placed), amount_g: grams }],
    placed,
  );
  if (!offer) return "";
  const item = placed.find((it) => it.name === offer.itemName);
  const qty = gramsToUnitQty(offer.grams, item?.unit, offer.itemName);
  if (qty == null) return "";
  const qtyArg = Math.round(qty * 1000) / 1000;
  return ` (для моделі: у коморі є «${offer.itemName}», запропонуй людині одним рядком списати ${offer.grams} г; якщо погодиться, виклич consume_from_pantry з name «${offer.itemName}» і qty ${qtyArg})`;
}
