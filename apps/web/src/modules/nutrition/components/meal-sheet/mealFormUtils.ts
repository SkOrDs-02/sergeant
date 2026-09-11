import { mealTypeByNow, type MealTypeId } from "../../lib/mealTypes";
import type { NullableMacros } from "@sergeant/shared";
import type {
  Meal,
  MealMacroSource,
  MealSource,
  MealTemplate,
} from "@sergeant/nutrition-domain";
import { deviceTimeOfDay } from "@sergeant/nutrition-domain";
import type { NutritionPhotoItem } from "@shared/api";
import { clampText } from "@shared/lib/text/limits";
import { parseDecimalInput } from "@shared/lib/format/numberInput";
import { newMealId } from "../../lib/mealId";

/**
 * 10 кг однієї порції — межа проти зайвого нуля, не дієтологія.
 *
 * AI-CONTEXT: живе тут, а не в компоненті, бо вагу порції задають ДВА
 * незалежні шляхи — крок «з упаковки» і картка обраного продукту. Поки
 * константа була приватною в картці, `useDecimalDraft` клампив лише
 * набране в ній самій, а значення, що прийшло ззовні готовим, проходило
 * повз межу і могло лягти в `amount_g`.
 */
export const MAX_PORTION_GRAMS = 10_000;

/**
 * Значення для touch-колеса ваги. До кілограма лишаємо точний крок 5 г,
 * вище — 50 г, щоб колесо не розросталось до двох тисяч рядків. Поточне
 * довільне значення додається без округлення, тому вага зі штрихкоду чи
 * старого запису не змінюється сама лише від відкриття форми.
 */
export function portionGramValues(current: string): number[] {
  const values: number[] = [];
  for (let grams = 5; grams <= 1000; grams += 5) values.push(grams);
  for (let grams = 1050; grams <= MAX_PORTION_GRAMS; grams += 50) {
    values.push(grams);
  }

  const currentGrams = Number(current.replace(",", "."));
  if (
    Number.isFinite(currentGrams) &&
    currentGrams > 0 &&
    currentGrams <= MAX_PORTION_GRAMS &&
    !values.includes(currentGrams)
  ) {
    values.push(currentGrams);
    values.sort((left, right) => left - right);
  }

  return values;
}

export function currentTime(): string {
  // ADR-0078: день-ключ запису — за годинником ПРИСТРОЮ, тож і час доби
  // поруч із ним мусить бути девайсовий. Київський час тут давав пару
  // «девайсовий день + київський настінний час», з якої `composeEatenAt`
  // складав момент, якого не існувало (о 23:53 UTC 23-го числа виходило
  // «23-тє 02:53»). `mealTypeByNow()` нижче вже рахує за `getHours()` —
  // тепер обидва дефолти читають один годинник.
  return deviceTimeOfDay();
}

export interface MealFormPhotoResult {
  dishName?: string | null;
  macros?: Partial<NullableMacros> | null;
}

export interface MealFormState {
  name: string;
  mealType: MealTypeId;
  time: string;
  kcal: string;
  protein_g: string;
  fat_g: string;
  carbs_g: string;
  err: string;
}

// Server-side fallback label when the AI photo analysis can't identify the
// food (see apps/server/src/lib/nutritionResponse.ts). Prefilling the name
// field with this literal reads as a real answer, so we blank it out and
// let the existing "name required" validation nudge the user to type one.
const PHOTO_FALLBACK_DISH_NAME = "Результат";

export function emptyForm(
  photoResult?: MealFormPhotoResult | null,
  mealType?: MealTypeId | null,
): MealFormState {
  const macros = photoResult?.macros || {};
  const dishName = (photoResult?.dishName || "").trim();
  return {
    name: dishName === PHOTO_FALLBACK_DISH_NAME ? "" : dishName,
    // Тип прийому: явний вибір людини (тап по сегменту hero) виграє
    // годинник. Без явного — той, що збігається з поточною годиною:
    // жорсткий "breakfast" о 21:00 змушував кожного, хто вечеряє пізно,
    // лізти в пікер і перемикати тип перед збереженням.
    mealType: mealType ?? mealTypeByNow(),
    time: currentTime(),
    kcal: macros.kcal != null ? String(Math.round(macros.kcal)) : "",
    protein_g:
      macros.protein_g != null ? String(Math.round(macros.protein_g)) : "",
    fat_g: macros.fat_g != null ? String(Math.round(macros.fat_g)) : "",
    carbs_g: macros.carbs_g != null ? String(Math.round(macros.carbs_g)) : "",
    err: "",
  };
}

/**
 * Вага порції з поля вводу. `100` — коли поле порожнє або негодяще:
 * запис без ваги неможливий, а нуль чи порожнеча в цьому місці дали б
 * прийом із нульовими макросами.
 *
 * Живе тут, а не в `AddMealSheet`: той уперся в `max-lines: 600`
 * (Hard Rule #18), а функція чиста й доменна.
 */
export function gramsOrDefault(raw: string): number {
  const parsed = parseDecimalInput(raw);
  return parsed.ok && parsed.value > 0 ? parsed.value : 100;
}

/** Дані для рядка, який пишеться коли фото-аналіз не дав `items[]`. */
export interface MealSaveFallback {
  id: string;
  macros: NullableMacros;
  source: MealSource;
  macroSource: MealMacroSource;
  foodId: string | null;
  amount_g: number | null;
}

/**
 * N рядків `Meal` на одне збереження — ініціатива 0023 PR-3.
 *
 * Джерело рядків — `photoItems`, застосовані на кроці «фото» (після
 * видалень/додавань там же), НЕ summed-поля кроку «fill»: ті людина може
 * відредагувати вручну, і якби рядки рахувались із них, ручна правка
 * підсумку розійшлася б із сумою того, що реально йде в журнал — той
 * самий баг, від якого тікає ініціатива. Без `items[]` (не-фото шлях,
 * редагування) — один рядок з `fallback`.
 *
 * `fallback.id` дублюється в перший рядок мультипозиційного шляху: обидва
 * викликають `newMealId()`/`draftId` рівно один раз у виклику (не тут), тож
 * ідемпотентність повторного тапу «Зберегти» не ламається.
 */
export function buildMealsForSave(params: {
  photoItems: NutritionPhotoItem[] | undefined;
  time: string;
  mealType: MealTypeId;
  label: string;
  fallbackName: string;
  fallback: MealSaveFallback;
}): Meal[] {
  const { photoItems, time, mealType, label, fallbackName, fallback } = params;
  if (!photoItems || photoItems.length === 0) {
    return [
      {
        id: fallback.id,
        time,
        mealType,
        label,
        name: fallbackName,
        macros: fallback.macros,
        source: fallback.source,
        macroSource: fallback.macroSource,
        foodId: fallback.foodId,
        amount_g: fallback.amount_g,
      },
    ];
  }
  return photoItems.map((item, index): Meal => ({
    id: index === 0 ? fallback.id : newMealId(),
    time,
    mealType,
    label,
    name: clampText(item.name.trim() || fallbackName),
    macros: item.macros,
    source: "photo",
    // Заміна через каталог (`PhotoAddItemPicker`) кладе `item.foodId` —
    // рядок стає `productDb`, а не «вгаданим» у `estimatedKcalShare`.
    macroSource: item.foodId ? "productDb" : "photoAI",
    foodId: item.foodId ?? null,
    amount_g: item.gramsApprox,
  }));
}

/**
 * Агрегатні назва/тип/КБЖВ страви для «Запамʼятати для повтору» — це
 * страва цілком, не окремий рядок журналу з `buildMealsForSave`.
 */
export interface MealSaveTemplate {
  name: string;
  mealType: MealTypeId;
  macros: NullableMacros;
}

/** Додає/оновлює шаблон повтору за назвою+типом (кейс-нечутливо), max 40. */
export function upsertMealTemplate(
  templates: MealTemplate[],
  template: MealSaveTemplate,
): MealTemplate[] {
  const normalizedName = template.name.trim().toLocaleLowerCase("uk-UA");
  const previous = templates.find(
    (t) =>
      t.mealType === template.mealType &&
      t.name.trim().toLocaleLowerCase("uk-UA") === normalizedName,
  );
  const remembered: MealTemplate = {
    id: previous?.id ?? `tpl_${Date.now()}`,
    name: template.name,
    mealType: template.mealType,
    macros: { ...template.macros },
  };
  return [remembered, ...templates.filter((t) => t.id !== previous?.id)].slice(
    0,
    40,
  );
}
