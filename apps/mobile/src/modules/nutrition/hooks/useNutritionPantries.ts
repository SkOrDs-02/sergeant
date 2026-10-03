/**
 * Управління коморами (пантрі) на MMKV — порт web `useNutritionPantries`.
 * AI-розбір великого списку: `useApiClient().nutrition.parsePantry` + `applyParsedItems` у `Pantry.tsx`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildPlacedItems,
  ensureStoragePlaces,
  mergeItemsIntoPlaces,
  movePantryItem,
  normalizePantries,
  parseLoosePantryText,
  resolvePlaceForItem,
  updatePantry,
  type Pantry,
  type PantryItem,
  type PlacedPantryItem,
} from "@sergeant/nutrition-domain";
import {
  loadActivePantryId,
  loadPantries,
  savePantries,
} from "../lib/nutritionStore";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { useNutritionSqliteReadTick } from "../lib/sqliteReadGate";

export interface UseNutritionPantriesResult {
  pantries: Pantry[];
  /** Позиції ВСІХ місць одним списком; індекс — адреса мутації. */
  pantryItems: readonly PlacedPantryItem[];
  /** Фільтр місця — екранний стан, не персистується. */
  placeFilter: string | null;
  setPlaceFilter: (id: string | null) => void;
  addLine: (line: string) => void;
  /** Результат `parsePantry` (сервер) — злиття по місцях. */
  applyParsedItems: (items: readonly PantryItem[]) => void;
  removeItemAt: (index: number) => void;
  /**
   * Re-insert an item at the given index in its place. Used by undo-toast
   * after `removeItemAt`. Если index >= length — додаємо у кінець;
   * index < 0 → no-op.
   */
  restoreItemAt: (
    index: number,
    item: PantryItem,
    pantryId?: string | undefined,
  ) => void;
  moveItemTo: (index: number, pantryId: string) => void;
  addPantry: (name: string) => void;
  refresh: () => void;
}

export function useNutritionPantries(): UseNutritionPantriesResult {
  // `ensureStoragePlaces` на кожному вході даних, не лише на першому:
  // інакше після теплого SQLite-кешу холодильник і морозилка зникали б.
  const [pantries, setPantries] = useState<Pantry[]>(() =>
    ensureStoragePlaces(loadPantries()),
  );
  const [placeFilter, setPlaceFilter] = useState<string | null>(null);

  /** Усі позиції всіх місць одним списком; індекс — адреса мутації. */
  const pantryItems = useMemo(() => buildPlacedItems(pantries), [pantries]);
  const placedRef = useRef(pantryItems);
  useEffect(() => {
    placedRef.current = pantryItems;
  }, [pantryItems]);

  const persist = useCallback((list: Pantry[]) => {
    // Активна комора більше не ведеться екраном; збережене значення
    // лишається як є, щоб фільтр місця не осів у сховищі.
    savePantries(normalizePantries(list), loadActivePantryId());
  }, []);

  useEffect(() => {
    persist(pantries);
  }, [pantries, persist]);

  const refresh = useCallback(() => {
    setPantries(ensureStoragePlaces(loadPantries()));
  }, []);

  // Stage 4 PR #033 + Stage 8 PR #057n: overlay pantries / active
  // pantry from the local SQLite cache once it's warm. MMKV
  // first-paint reads above stay as a synchronous fallback so the
  // first paint never blocks on SQLite.
  // Render-time update avoids `react-hooks/set-state-in-effect` (init 0021).
  const sqliteCacheTick = useNutritionSqliteReadTick();
  const [prevTick, setPrevTick] = useState(sqliteCacheTick);
  if (sqliteCacheTick !== prevTick) {
    setPrevTick(sqliteCacheTick);
    const cache = getCachedNutritionSqliteState();
    if (cache.refreshedAt !== null) {
      setPantries(ensureStoragePlaces(cache.pantries));
    }
  }

  /** Ручне розміщення сильніше за вгадування — див. `resolvePlaceForItem`. */
  const mergeIntoPlaces = useCallback((list: readonly PantryItem[]) => {
    if (list.length === 0) return;
    setPantries((cur) =>
      mergeItemsIntoPlaces(cur, list, (name) =>
        resolvePlaceForItem(placedRef.current, name),
      ),
    );
  }, []);

  const addLine = useCallback(
    (line: string) => mergeIntoPlaces(parseLoosePantryText(line)),
    [mergeIntoPlaces],
  );

  const applyParsedItems = useCallback(
    (items: readonly PantryItem[]) =>
      mergeIntoPlaces(Array.isArray(items) ? items : []),
    [mergeIntoPlaces],
  );

  const removeItemAt = useCallback((index: number) => {
    if (index < 0) return;
    const target = placedRef.current[index];
    if (!target) return;
    setPantries((cur) =>
      updatePantry(cur, target.pantryId, (p) => {
        const items = Array.isArray(p.items) ? [...p.items] : [];
        if (target.localIdx >= items.length) return p;
        items.splice(target.localIdx, 1);
        return { ...p, items };
      }),
    );
  }, []);

  const restoreItemAt = useCallback(
    (index: number, item: PantryItem, pantryId?: string | undefined) => {
      if (index < 0 || !item) return;
      const id = pantryId ?? placedRef.current[index]?.pantryId;
      if (!id) return;
      setPantries((cur) =>
        updatePantry(cur, id, (p) => {
          const items = Array.isArray(p.items) ? [...p.items] : [];
          // Сплайс із clamp-нутим індексом — якщо item-ів стало менше
          // (паралельний remove), просто додаємо в кінець.
          items.splice(Math.min(index, items.length), 0, item);
          return { ...p, items };
        }),
      );
    },
    [],
  );

  const moveItemTo = useCallback((index: number, pantryId: string) => {
    const src = placedRef.current[index];
    if (!src || src.pantryId === pantryId) return;
    setPantries((cur) => {
      const res = movePantryItem(
        cur,
        { pantryId: src.pantryId, localIdx: src.localIdx },
        pantryId,
      );
      return res.moved ? res.pantries : cur;
    });
  }, []);

  const addPantry = useCallback((name: string) => {
    const n = String(name || "").trim();
    if (!n) return;
    const id = `p_${Date.now()}`;
    setPantries((cur) =>
      normalizePantries([
        ...(Array.isArray(cur) ? cur : []),
        { id, name: n, items: [], text: "" },
      ]),
    );
  }, []);

  return {
    pantries,
    pantryItems,
    placeFilter,
    setPlaceFilter,
    addLine,
    applyParsedItems,
    removeItemAt,
    restoreItemAt,
    moveItemTo,
    addPantry,
    refresh,
  };
}
