/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Відновлює звʼязаний продукт при РЕДАГУВАННІ прийому.
 *
 * AI-DANGER: страва зберігає `foodId` і `amount_g`, але НЕ `per100` —
 * тобто саму етикетку. Без цього читання аркуш редагування не мав ні поля
 * ваги, ні перерахунку: `PickedFoodCard` рендериться лише під
 * `pickedFood`, а той при кожному відкритті скидався в `null`. Наслідок —
 * порцію страви, заведеної з продукту, змінити було неможливо взагалі,
 * лишалось правити КБЖВ руками (browser-QA 2026-09-02). Це той самий клас
 * діри, який уже ловили для шляху СТВОРЕННЯ — див. докстрінг
 * `PickedFoodCard` про поле ваги, що розмонтовувалось рівно тоді, коли
 * мало б зʼявитись.
 *
 * Повернуте значення веде в `PickedFoodCard.skipInitialRescale`, і це не
 * косметика: без нього ефект картки миттю переписав би збережені макроси
 * добутком `per100 × вага`, тобто саме лише ВІДКРИТТЯ аркуша тихо міняло б
 * дані страви, чиї КБЖВ людина правила руками або які приїхали з фото.
 * Тому `setPickedFood` і прапорець ідуть одним батчем: картка монтується
 * вже з піднятим гардом.
 *
 * Усі ланки діють лише для `macroSource: productDb`: прийом, чиї КБЖВ людина
 * переписала руками (`manual`, `foodId` лишається), не відновлюється — інакше
 * зміна ваги стерла б її цифри значенням з каталогу.
 *
 * Локальна база — не єдине джерело (аудит 2026-10-01, ux-13). Seed-продукти
 * мали випадковий `food_<uuid>` на кожному пристрої, тож на іншому телефоні
 * чи після очищення даних сайту `getFoodById` повертав `null`, поле ваги
 * зникало, а запис виглядав «Вручну». Ланцюжок відновлення:
 *   1. локальна foodDb за `foodId`;
 *   2. `gen_<slug>` — стабільний id базової їжі, її етикетка є в спільному
 *      корпусі `GENERIC_FOODS` (підшлях + `import()`, щоб корпус не потрапив
 *      в eager-чанк — той самий розрахунок, що й у `seedFoodsUk`);
 *   3. запис `macroSource: productDb` з вагою — етикетка відновлюється
 *      діленням: `per100 = макроси × 100 / amount_g`. Для прийому, взятого з
 *      бази, макроси = `per100 × вага`, тож ділення дає його етикетку (з
 *      точністю округлення полів).
 *
 * Межа ланки 3: запис не несе етикетки, тому вона не відрізняє прийом з
 * бази від старого рядка, збереженого ДО фіксу ux-13 — тоді ручна правка КБЖВ
 * лишала `productDb`. Для такого рядка на пристрої без локального продукту
 * `per100` виводиться з ручних цифр: поле ваги з'являється, а його зміна
 * масштабує їх пропорційно порції (замість «Вручну, не масштабуються»). Нові
 * ручні правки це не відтворюють (`resolveMacroSource` ставить `manual`).
 * Розрізнити старі рядки можна лише збереженою етикеткою/позначкою походження
 * в записі (міграція, поза скоупом) — рішення власника продукту.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { getFoodById } from "../../lib/foodDb/foodDb";
import type { PickedFood } from "./FoodPickerSection";

interface EditedMealMacros {
  kcal?: number | null | undefined;
  protein_g?: number | null | undefined;
  fat_g?: number | null | undefined;
  carbs_g?: number | null | undefined;
}

interface UseEditedFoodRehydrationArgs {
  open: boolean;
  /** Редагований прийом; `null`/без `id` — створення нового. */
  meal:
    | {
        id?: string | undefined;
        name?: string | undefined;
        foodId?: string | null | undefined;
        amount_g?: number | null | undefined;
        macros?: EditedMealMacros | null | undefined;
        macroSource?: string | null | undefined;
      }
    | null
    | undefined;
  setPickedFood: Dispatch<SetStateAction<PickedFood | null>>;
}

const GENERIC_FOOD_ID_PREFIX = "gen_";

/**
 * Етикета базової їжі зі спільного корпусу за id `gen_<slug>`. Динамічний
 * `import()` підшляху — не барель `@sergeant/shared` (див. шапку).
 */
async function pickGenericFood(foodId: string): Promise<PickedFood | null> {
  if (!foodId.startsWith(GENERIC_FOOD_ID_PREFIX)) return null;
  const slug = foodId.slice(GENERIC_FOOD_ID_PREFIX.length);
  const { GENERIC_FOODS } = await import("@sergeant/shared/data/genericFoods");
  const food = GENERIC_FOODS.find((f) => f.slug === slug);
  if (!food) return null;
  return {
    id: foodId,
    name: food.name,
    brand: "",
    defaultGrams: food.defaultGrams ?? 100,
    per100: {
      kcal: food.per100.kcal,
      protein_g: food.per100.protein_g,
      fat_g: food.per100.fat_g,
      carbs_g: food.per100.carbs_g,
    },
  };
}

/**
 * Остання ланка: продукту ніде немає, але прийом сам несе порцію (вага +
 * КБЖВ на неї) і позначений як взятий з бази — тоді етикета на 100 г
 * виводиться з нього.
 */
export function per100FromMeal(
  amountG: number | null | undefined,
  macros: EditedMealMacros | null | undefined,
): PickedFood["per100"] | null {
  if (amountG == null || !(amountG > 0) || !macros) return null;
  if (macros.kcal == null || !Number.isFinite(macros.kcal)) return null;
  const per100 = (n: number | null | undefined) =>
    Math.round((((n ?? 0) * 100) / amountG) * 100) / 100;
  return {
    kcal: per100(macros.kcal),
    protein_g: per100(macros.protein_g),
    fat_g: per100(macros.fat_g),
    carbs_g: per100(macros.carbs_g),
  };
}

export interface EditedFoodRehydration {
  /** `true`, коли продукт відновлено з бази, а не обраний людиною щойно. */
  rehydrated: boolean;
  /**
   * Зняти позначку. Викликається, коли людина ЯВНО йде обирати інший
   * продукт: далі будь-який вибір — її дія, і глушити перерахунок під нього
   * було б помилкою.
   */
  clear: () => void;
}

export function useEditedFoodRehydration({
  open,
  meal,
  setPickedFood,
}: UseEditedFoodRehydrationArgs): EditedFoodRehydration {
  // Тримаємо ID, а не булеан: скидати прапорець на закритті довелось би
  // синхронним `setState` всередині ефекту (каскадні рендери, і лінт це
  // ловить). Похідне порівняння дає той самий результат без стану-двійника.
  const [rehydratedId, setRehydratedId] = useState<string | null>(null);
  // AI-DANGER: `clear()` мусить ГАСИТИ читання, що вже в польоті, а не лише
  // скидати позначку. Інакше людина, яка встигла піти по інший продукт
  // швидше, ніж відповіла база, отримувала `setPickedFood` зі СТАРИМ
  // продуктом поверх свого нового вибору — і зберігала прийом із чужими
  // макросами (ревʼю PR #1053). `cancelled` цього не ловить: він живе в
  // замиканні ефекту, а ефект від `clear()` не перезапускається.
  const lookupGeneration = useRef(0);
  const editedFoodId = meal?.id ? (meal.foodId ?? null) : null;
  // Примітиви, а не обʼєкт `meal`: його ідентичність міняється на кожному
  // рендері батька, і ефект перечитував би базу без потреби.
  const mealName = meal?.name ?? "";
  const fromDb = meal?.macroSource === "productDb";
  const amountG = meal?.amount_g ?? null;
  const kcal = meal?.macros?.kcal ?? null;
  const proteinG = meal?.macros?.protein_g ?? null;
  const fatG = meal?.macros?.fat_g ?? null;
  const carbsG = meal?.macros?.carbs_g ?? null;

  useEffect(() => {
    // AI-DANGER: лише `productDb`. `foodId` у збереженому прийомі переживає
    // ручну правку КБЖВ (`effectiveFoodId` в `AddMealSheet`), але
    // `macroSource` тоді стає `manual`. Відновлений продукт відкриває поле
    // ваги, а `PickedFoodCard` на зміну ваги переписує всі чотири поля
    // `per100 × вага` — тобто тихо замінив би ручні КБЖВ значенням з каталогу.
    if (!open || !editedFoodId || !fromDb) return;
    const generation = ++lookupGeneration.current;
    let cancelled = false;
    const lookup = async (): Promise<PickedFood | null> => {
      const food = await getFoodById(editedFoodId);
      if (food) {
        return {
          id: food.id,
          name: food.name,
          brand: food.brand,
          defaultGrams: food.defaultGrams,
          per100: food.per100,
        };
      }
      const generic = await pickGenericFood(editedFoodId);
      if (generic) return generic;
      const per100 = per100FromMeal(amountG, {
        kcal,
        protein_g: proteinG,
        fat_g: fatG,
        carbs_g: carbsG,
      });
      if (!per100) return null;
      return {
        id: editedFoodId,
        name: mealName,
        brand: "",
        defaultGrams: amountG ?? 100,
        per100,
      };
    };
    void lookup()
      .then((picked) => {
        if (cancelled || generation !== lookupGeneration.current || !picked) {
          return;
        }
        setPickedFood(picked);
        setRehydratedId(editedFoodId);
      })
      .catch(() => {
        // Відновлення — best-effort: без нього аркуш відкривається як раніше
        // (КБЖВ редагуються руками).
      });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    editedFoodId,
    setPickedFood,
    mealName,
    fromDb,
    amountG,
    kcal,
    proteinG,
    fatG,
    carbsG,
  ]);

  const clear = useCallback(() => {
    lookupGeneration.current += 1;
    setRehydratedId(null);
  }, []);

  return {
    rehydrated: open && editedFoodId !== null && rehydratedId === editedFoodId,
    clear,
  };
}
