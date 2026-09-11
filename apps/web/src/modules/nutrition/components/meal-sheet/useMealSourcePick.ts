/**
 * Автопідбір продукту для «готових» джерел аркуша: чек і комора.
 *
 * Живе окремо від `AddMealSheet`, бо той уперся в `max-lines: 600`
 * (Hard Rule #18), а ця трійця колбеків — самостійне ціле: один намір
 * («людина вже назвала цей продукт деінде»), різний лише хвіст.
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
  /** Позицію чека обрано. Вагу не чіпаємо — чек знає фасування. */
  onReceiptItemPicked: (query: string) => void;
  /** Позицію комори обрано — підставляємо типову порцію каталогу. */
  onPantryItemPicked: (query: string) => void;
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

  // Комора ваги порції не знає: `qty`/`unit` позиції — це ЗАЛИШОК на
  // полиці, а не скільки людина щойно зʼїла. Тому береться типова порція
  // каталогу, рівно як при ручному виборі в пошуку
  // (`FoodPickerSection.tsx:133,155`).
  const onPantryItemPicked = useCallback(
    (query: string) =>
      schedule(query, (hit) => {
        setPickedGrams(String(Math.round(Number(hit.defaultGrams) || 100)));
      }),
    [schedule, setPickedGrams],
  );

  const cancelAutoPick = useCallback(() => {
    cancel();
    setFoodQuery("");
  }, [cancel, setFoodQuery]);

  return {
    onReceiptItemPicked: schedule,
    onPantryItemPicked,
    cancelAutoPick,
  };
}
