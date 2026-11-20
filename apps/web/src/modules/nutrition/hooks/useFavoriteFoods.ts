/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Позначені продукти для блоку «Улюблені» на вкладці «Пошук». Читає лише
 * поки `enabled` (аркуш відкрито на новий запис, запит порожній) і щоразу,
 * коли змінюється сам список позначок.
 */
import { useEffect, useState } from "react";
import type { FoodProduct } from "../lib/foodDb/foodDb";
import { resolveFavoriteFoods } from "../lib/favoriteFoods";

const EMPTY: FoodProduct[] = [];

export function useFavoriteFoods(
  ids: ReadonlySet<string> | undefined,
  enabled: boolean,
): FoodProduct[] {
  const [foods, setFoods] = useState<FoodProduct[]>([]);
  const active = enabled && ids != null && ids.size > 0;
  useEffect(() => {
    if (!active || !ids) return;
    let alive = true;
    void resolveFavoriteFoods(ids).then((list) => {
      if (alive) setFoods(list);
    });
    return () => {
      alive = false;
    };
  }, [ids, active]);
  // Зняли останню позначку чи набрали запит: блоку немає одразу, без
  // чекання наступного читання.
  return active ? foods.filter((f) => ids?.has(f.id)) : EMPTY;
}
