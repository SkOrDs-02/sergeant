import { mealTypeByNow, type MealTypeId } from "../../lib/mealTypes";
import { sumMacrosNullable, type NullableMacros } from "@sergeant/shared";
import type {
  Meal,
  MealMacroSource,
  MealSource,
  MealTemplate,
} from "@sergeant/nutrition-domain";
import { deviceTimeOfDay } from "@sergeant/nutrition-domain";
import type { NutritionPhotoItem, NutritionPhotoResult } from "@shared/api";
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
export const MAX_KCAL_PER_MEAL = 10_000;
export const MAX_MACRO_GRAMS = 2_000;

/** Nullable fields and comma decimals retain the same save-time validation. */
export function validateMealMacroFields(
  form: MealFormState,
):
  | { macros: NullableMacros; error?: never }
  | { error: string; macros?: never } {
  const inputs = (["kcal", "protein_g", "fat_g", "carbs_g"] as const).map(
    (key) => (form[key] === "" ? null : parseDecimalInput(form[key])),
  );
  if (inputs.some((value) => value != null && !value.ok)) {
    return { error: "Некоректне значення КБЖВ. Впиши число, наприклад 12,5." };
  }
  const [kcal, protein_g, fat_g, carbs_g] = inputs.map((value) =>
    value != null && value.ok ? value.value : null,
  ) as [number | null, number | null, number | null, number | null];
  if (kcal != null && kcal > MAX_KCAL_PER_MEAL) {
    return {
      error: `Забагато калорій: максимум ${MAX_KCAL_PER_MEAL} ккал на прийом. Зменш значення або розбий на кілька прийомів.`,
    };
  }
  if (
    [protein_g, fat_g, carbs_g].some(
      (value) => value != null && value > MAX_MACRO_GRAMS,
    )
  ) {
    return {
      error: `Забагато БЖВ: максимум ${MAX_MACRO_GRAMS} г на прийом. Зменш значення.`,
    };
  }
  return { macros: { kcal, protein_g, fat_g, carbs_g } };
}

/** The same product label seeds the form and supplies its save fallback. */
export function foodDisplayName(
  food: { name?: string | undefined; brand?: string | null | undefined } | null,
): string {
  return food ? [food.name, food.brand].filter(Boolean).join(" ").trim() : "";
}

/** Apply photo totals while retaining the meal type and time already chosen. */
export function photoResultToForm(
  result: NutritionPhotoResult,
  previous: MealFormState,
): MealFormState {
  const macros = result.items?.length
    ? sumMacrosNullable(result.items.map((item) => item.macros))
    : result.macros;
  return {
    ...emptyForm({ ...result, macros }),
    mealType: previous.mealType,
    time: previous.time,
  };
}

/** Untouched metadata belongs to the original row; explicit unlink wins. */
export function mealSaveOrigin({
  initialMeal,
  foodId,
  photo,
  sourceReplaced,
  manualMacros,
}: {
  initialMeal: Partial<Meal> | null | undefined;
  foodId: string | number | undefined;
  photo: boolean;
  sourceReplaced: boolean;
  manualMacros: boolean;
}): Pick<Meal, "source" | "macroSource" | "foodId"> {
  const keepOriginal = !sourceReplaced && !manualMacros;
  const effectiveFoodId = foodId ?? (keepOriginal ? initialMeal?.foodId : null);
  return {
    source: photo
      ? "photo"
      : !sourceReplaced
        ? (initialMeal?.source ?? "manual")
        : "manual",
    macroSource: photo
      ? "photoAI"
      : foodId != null
        ? "productDb"
        : keepOriginal
          ? (initialMeal?.macroSource ??
            (initialMeal?.foodId ? "productDb" : "manual"))
          : "manual",
    foodId: effectiveFoodId != null ? String(effectiveFoodId) : null,
  };
}

/**
 * Значення для touch-колеса ваги. До кілограма точний крок 5 г, вище —
 * 50 г, щоб колесо не розросталось до двох тисяч рядків.
 *
 * `extras` — довільні числа поза сіткою (33 г з OFF, 150.5 з чека,
 * вага старого запису). Вони додаються без округлення, тому вага зі
 * штрихкоду чи старого запису не змінюється сама лише від відкриття
 * форми.
 *
 * AI-DANGER: список мусить лишатись СТАЛИМ, поки аркуш відкритий.
 * Раніше сюди йшла поточна вага рядком, і довільне число зникало зі
 * списку, щойно людина крутила колесо далі, — довжина масиву мінялась
 * на 1, усі індекси після нього зсувались, і колесо стрибало на рядок
 * після КОЖНОГО коміту. Тому накопичення `extras` тримає
 * `useWheelGrams`, а не цей чистий хелпер.
 */
const PORTION_GRAM_BASE: readonly number[] = (() => {
  const values: number[] = [];
  for (let grams = 5; grams <= 1000; grams += 5) values.push(grams);
  for (let grams = 1050; grams <= MAX_PORTION_GRAMS; grams += 50) {
    values.push(grams);
  }
  return Object.freeze(values);
})();

const PORTION_GRAM_BASE_SET: ReadonlySet<number> = new Set(PORTION_GRAM_BASE);

/** Чи лежить вага на регулярній сітці колеса. */
export function isPortionGramOnGrid(grams: number): boolean {
  return PORTION_GRAM_BASE_SET.has(grams);
}

export function portionGramValues(extras: readonly number[] = []): number[] {
  const extra = extras.filter(
    (grams) =>
      Number.isFinite(grams) &&
      grams > 0 &&
      grams <= MAX_PORTION_GRAMS &&
      !PORTION_GRAM_BASE_SET.has(grams),
  );
  if (extra.length === 0) return [...PORTION_GRAM_BASE];

  return [...new Set([...PORTION_GRAM_BASE, ...extra])].sort(
    (left, right) => left - right,
  );
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

/**
 * Значення макросу для поля форми: точність 0.1 (та сама, що в
 * `macrosForGrams`), без округлення до цілих. Ціле лишається цілим
 * ("12", не "12.0"). Округлення до цілих - лише на показі
 * (`fmtMacro`/`Measure`), інакше сума позицій дня розходиться з
 * підсумком.
 */
export function macroToFieldString(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Чотири поля КБЖВ форми з nullable-макросів; `null` -> порожнє поле. */
export function macrosToFormFields(mac: {
  kcal?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  carbs_g?: number | null;
}): Pick<MealFormState, "kcal" | "protein_g" | "fat_g" | "carbs_g"> {
  const f = (n: number | null | undefined) =>
    n != null ? macroToFieldString(n) : "";
  return {
    kcal: f(mac.kcal),
    protein_g: f(mac.protein_g),
    fat_g: f(mac.fat_g),
    carbs_g: f(mac.carbs_g),
  };
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
    kcal: macros.kcal != null ? macroToFieldString(macros.kcal) : "",
    protein_g:
      macros.protein_g != null ? macroToFieldString(macros.protein_g) : "",
    fat_g: macros.fat_g != null ? macroToFieldString(macros.fat_g) : "",
    carbs_g: macros.carbs_g != null ? macroToFieldString(macros.carbs_g) : "",
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

/**
 * True when every macro field is null or 0 — mirrors the `hasPhotoMacros`
 * predicate below (photo AI returns all-null macros when it can't
 * identify the food). A meal saved with all-empty macros won't move the
 * daily stats at all, so `handleSave` routes through a confirm step
 * instead of blocking the save outright (founder decision: warn, don't
 * block).
 */
export function macrosAreAllEmpty(macros: {
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
}): boolean {
  return !Object.values(macros).some((v) => v != null && v !== 0);
}
