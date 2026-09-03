/**
 * Last validated: 2026-09-03
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
 */
import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { getFoodById } from "../../lib/foodDb/foodDb";
import type { PickedFood } from "./FoodPickerSection";

interface UseEditedFoodRehydrationArgs {
  open: boolean;
  /** Редагований прийом; `null`/без `id` — створення нового. */
  meal: { id?: string | undefined; foodId?: string | null } | null | undefined;
  setPickedFood: Dispatch<SetStateAction<PickedFood | null>>;
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
  const editedFoodId = meal?.id ? (meal.foodId ?? null) : null;

  useEffect(() => {
    if (!open || !editedFoodId) return;
    let cancelled = false;
    void getFoodById(editedFoodId).then((food) => {
      if (cancelled || !food) return;
      setPickedFood({
        id: food.id,
        name: food.name,
        brand: food.brand,
        defaultGrams: food.defaultGrams,
        per100: food.per100,
      });
      setRehydratedId(editedFoodId);
    });
    return () => {
      cancelled = true;
    };
  }, [open, editedFoodId, setPickedFood]);

  const clear = useCallback(() => setRehydratedId(null), []);

  return {
    rehydrated: open && editedFoodId !== null && rehydratedId === editedFoodId,
    clear,
  };
}
