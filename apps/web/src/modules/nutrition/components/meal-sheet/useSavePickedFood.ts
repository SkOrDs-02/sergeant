/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Що аркуш запису робить з обраним продуктом у мить збереження запису:
 * пише в базу продукт із кроку «З упаковки» (до цього він лише в памʼяті,
 * тож скасований аркуш не лишає «сміття» в пошуку) і запамʼятовує обрану
 * одиницю (г / порція) для наступного запису.
 */
import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { nutritionKeys } from "@shared/lib/api/queryKeys";
import { upsertFood } from "../../lib/foodDb/foodDb";
import type { PickedFood } from "./FoodPickerSection";
import { rememberLastUnit } from "./portionUnits";

export function useSavePickedFood() {
  const queryClient = useQueryClient();
  // Памʼять пишемо лише при збереженні, а не при кожному перемиканні.
  const lastUnit = useRef<{ foodId: string; unitId: string } | null>(null);

  const onUnitChange = useCallback((foodId: string, unitId: string) => {
    lastUnit.current = { foodId, unitId };
  }, []);

  const persist = (pickedFood: PickedFood | null) => {
    if (!pickedFood) return;
    if (pickedFood.unsaved) {
      const { unsaved: _unsaved, ...product } = pickedFood;
      void upsertFood(product).then(() =>
        queryClient.invalidateQueries({ queryKey: nutritionKeys.foodSearch }),
      );
    }
    const unit = lastUnit.current;
    if (
      unit &&
      pickedFood.id != null &&
      unit.foodId === String(pickedFood.id)
    ) {
      rememberLastUnit(unit.foodId, unit.unitId);
    }
  };

  return { onUnitChange, persist };
}
