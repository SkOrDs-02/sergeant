/**
 * Автопідбір продукту для позиції комори.
 *
 * Живе окремо від `AddMealSheet`, бо той уперся в `max-lines: 600`
 * (Hard Rule #18).
 *
 * Раніше сюди ходив і рядок «З чека» власним входом. Поставкою
 * 2026-09-11 його прибрано: вага фасування переїхала на джерело комори
 * (`PantryItemSource.packGrams`), тож джерело лишилось одне.
 *
 * Last validated: 2026-09-11
 * Status: Active
 */
import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { PickedFood } from "./FoodPickerSection";
import type { UseFoodSearchResult } from "./useFoodSearch";
import { useSourceAutoPick } from "./useSourceAutoPick";

interface MealSourcePickArgs {
  foodQuery: string;
  search: UseFoodSearchResult;
  setFoodQuery: Dispatch<SetStateAction<string>>;
  setPickedFood: Dispatch<SetStateAction<PickedFood | null>>;
  setPickedGrams: Dispatch<SetStateAction<string>>;
}

export interface MealSourcePick {
  /**
   * Позицію комори обрано. `packGrams` — вага фасування з найсвіжішого
   * чека, якщо вона відома; тоді типову порцію каталогу НЕ підставляємо.
   */
  onPantryItemPicked: (query: string, packGrams: number | null) => void;
  /**
   * Гасить намір, що ще чекає на пошук, і прибирає запит. Потрібен і при
   * знятті позиції комори, і при виході з кроку «Заповнення» назад.
   */
  cancelAutoPick: () => void;
}

export function useMealSourcePick({
  foodQuery,
  search,
  setFoodQuery,
  setPickedFood,
  setPickedGrams,
}: MealSourcePickArgs): MealSourcePick {
  const { schedule, cancel } = useSourceAutoPick<PickedFood>({
    foodQuery,
    search,
    setFoodQuery,
    setPickedFood,
  });

  // `qty`/`unit` позиції комори — це ЗАЛИШОК на полиці, а не скільки
  // людина щойно зʼїла, тож вага береться з двох інших джерел у порядку
  // точності: фасування з чека (його вже підставив сам чіп), інакше —
  // типова порція каталогу, рівно як при ручному виборі в пошуку
  // (`FoodPickerSection.tsx:133,155`).
  //
  // AI-DANGER: перевірка `packGrams` тут обовʼязкова. Автопідбір
  // відповідає АСИНХРОННО, вже після синхронного `setPickedGrams` у
  // чіпі, — без неї довідникова здогадка тихо затирала б точну вагу
  // фасування з чека людини.
  const onPantryItemPicked = useCallback(
    (query: string, packGrams: number | null) =>
      schedule(query, (hit) => {
        if (packGrams != null) return;
        setPickedGrams(String(Math.round(Number(hit.defaultGrams) || 100)));
      }),
    [schedule, setPickedGrams],
  );

  const cancelAutoPick = useCallback(() => {
    cancel();
    setFoodQuery("");
  }, [cancel, setFoodQuery]);

  return { onPantryItemPicked, cancelAutoPick };
}
