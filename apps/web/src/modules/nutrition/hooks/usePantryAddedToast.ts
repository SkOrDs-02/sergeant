/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import { useCallback, useRef } from "react";
import { matchFoodName } from "@sergeant/nutrition-domain";
import type { useToast } from "@shared/hooks/useToast";
import type {
  useNutritionPantries,
  PantryItemsAddedEntry,
} from "./useNutritionPantries";
import { buildPantryAddedToastMessage } from "../lib/pantryAddedToast";

/**
 * Тост «куди лягло» після додавання в комору. Винесено з `NutritionApp`
 * під стелю Hard Rule #18 (поведінка не змінена).
 */
export function usePantryAddedToast(toast: ReturnType<typeof useToast>) {
  // Рішення власника 2026-09-11 — «куди лягло» тост живе тут (page-рівень,
  // де вже є `useToast()`), не всередині `useNutritionPantries`. Колбек
  // мусить читати найсвіжіші `pantry.pantries`/`pantry.pantryItems`, але
  // сам хук ще не повернув значення в момент, коли колбек передається йому
  // ПАРАМЕТРОМ — класична курка-яйце. `pantryRef` розриває цикл: колбек
  // читає його в МОМЕНТ виклику (після кліку користувача), а не в момент
  // визначення, тож посилання на ще неіснуючий `pantry` тут не потрібне.
  const pantryRef = useRef<ReturnType<typeof useNutritionPantries> | null>(
    null,
  );
  const onPantryItemsAdded = useCallback(
    (items: PantryItemsAddedEntry[]) => {
      const p = pantryRef.current;
      if (!p) return;
      const msg = buildPantryAddedToastMessage(items, p.pantries);
      if (!msg) return;

      // Дія «Змінити» — лише для одиночного додавання: список одразу
      // втратив би сенс «однієї» адреси для редагування.
      const single = items.length === 1 ? items[0] : undefined;
      toast.success(
        msg,
        undefined,
        single
          ? {
              label: "Змінити",
              onClick: () => {
                // Адресу рахуємо ЛІНИВО, на кліку — не в момент показу
                // toast. `setPantries` усередині хука асинхронний, тож
                // одразу після виклику `pantryRef.current` ще вказує на
                // стан ДО злиття, і щойно доданої позиції в ньому просто
                // немає. До моменту фактичного кліку користувача re-render
                // уже закомітився.
                const cur = pantryRef.current;
                if (!cur) return;
                const key = matchFoodName(single.name);
                const idx = cur.pantryItems.findIndex(
                  (x) =>
                    x.pantryId === single.pantryId &&
                    matchFoodName(x.name) === key,
                );
                if (idx >= 0) cur.editItemAt(idx);
              },
            }
          : undefined,
      );
    },
    [toast],
  );

  return { pantryRef, onPantryItemsAdded };
}
