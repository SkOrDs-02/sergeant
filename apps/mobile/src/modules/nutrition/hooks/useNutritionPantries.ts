/**
 * Управління коморами (пантрі) на MMKV — порт web `useNutritionPantries`.
 * AI-розбір великого списку: `useApiClient().nutrition.parsePantry` + `applyParsedItems` у `Pantry.tsx`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  mergeItems,
  normalizePantries,
  parseLoosePantryText,
  updatePantry,
  makeDefaultPantry,
  type Pantry,
  type PantryItem,
} from "@sergeant/nutrition-domain";
import {
  loadActivePantryId,
  loadPantries,
  savePantries,
} from "../lib/nutritionStore";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { useNutritionSqliteReadGate } from "../lib/sqliteReadGate";

export interface UseNutritionPantriesResult {
  pantries: Pantry[];
  activePantryId: string;
  activePantry: Pantry;
  setActivePantryId: (id: string) => void;
  addLine: (line: string) => void;
  /** Результат `parsePantry` (сервер) — злиття в активний склад. */
  applyParsedItems: (items: readonly PantryItem[]) => void;
  removeItemAt: (index: number) => void;
  /**
   * Re-insert an item at the given index in the active pantry. Used by
   * undo-toast after `removeItemAt`. Если index >= length — додаємо у
   * кінець; index < 0 → no-op.
   */
  restoreItemAt: (index: number, item: PantryItem) => void;
  addPantry: (name: string) => void;
  refresh: () => void;
}

export function useNutritionPantries(): UseNutritionPantriesResult {
  const [pantries, setPantries] = useState<Pantry[]>(() => loadPantries());
  const [activePantryId, setActivePantryIdState] = useState(() =>
    loadActivePantryId(),
  );
  const activeIdRef = useRef(activePantryId);
  useEffect(() => {
    activeIdRef.current = activePantryId;
  }, [activePantryId]);

  const activePantry = useMemo(() => {
    const arr = Array.isArray(pantries) ? pantries : [];
    return (
      arr.find((p) => p.id === activePantryId) || arr[0] || makeDefaultPantry()
    );
  }, [pantries, activePantryId]);

  const persist = useCallback((list: Pantry[], activeId: string) => {
    const norm = normalizePantries(list);
    savePantries(norm, activeId);
  }, []);

  useEffect(() => {
    persist(pantries, activePantryId);
  }, [pantries, activePantryId, persist]);

  const refresh = useCallback(() => {
    setPantries(loadPantries());
    setActivePantryIdState(loadActivePantryId());
  }, []);

  // Stage 4 PR #033: under `feature.nutrition.sqlite_v2.read_sqlite`,
  // overlay pantries / active pantry from the local SQLite cache once
  // it's warm. MMKV first-paint reads above stay as a synchronous
  // fallback so the first paint never blocks on SQLite.
  const { enabled: sqliteReadEnabled, tick: sqliteCacheTick } =
    useNutritionSqliteReadGate();
  useEffect(() => {
    if (!sqliteReadEnabled) return;
    const cache = getCachedNutritionSqliteState();
    if (cache.refreshedAt === null) return;
    setPantries(cache.pantries);
    if (cache.activePantryId) setActivePantryIdState(cache.activePantryId);
  }, [sqliteReadEnabled, sqliteCacheTick]);

  const setActivePantryId = useCallback((id: string) => {
    if (!id) return;
    setActivePantryIdState(id);
  }, []);

  const addLine = useCallback((line: string) => {
    const parsed = parseLoosePantryText(line);
    if (parsed.length === 0) return;
    setPantries((cur) => {
      const act = activeIdRef.current;
      return updatePantry(cur, act, (p) => ({
        ...p,
        items: mergeItems(p.items, parsed),
      }));
    });
  }, []);

  const applyParsedItems = useCallback((items: readonly PantryItem[]) => {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) return;
    setPantries((cur) => {
      const act = activeIdRef.current;
      return updatePantry(cur, act, (p) => ({
        ...p,
        items: mergeItems(p.items, list),
      }));
    });
  }, []);

  const removeItemAt = useCallback((index: number) => {
    if (index < 0) return;
    setPantries((cur) =>
      updatePantry(cur, activeIdRef.current, (p) => {
        const items = Array.isArray(p.items) ? [...p.items] : [];
        if (index >= items.length) return p;
        items.splice(index, 1);
        return { ...p, items };
      }),
    );
  }, []);

  const restoreItemAt = useCallback((index: number, item: PantryItem) => {
    if (index < 0 || !item) return;
    setPantries((cur) =>
      updatePantry(cur, activeIdRef.current, (p) => {
        const items = Array.isArray(p.items) ? [...p.items] : [];
        // Сплайс із clamp-нутим індексом — якщо item-ів стало менше
        // (паралельний remove), просто додаємо в кінець.
        const clamped = Math.min(index, items.length);
        items.splice(clamped, 0, item);
        return { ...p, items };
      }),
    );
  }, []);

  const addPantry = useCallback((name: string) => {
    const n = String(name || "").trim();
    if (!n) return;
    const id = `p_${Date.now()}`;
    setPantries((cur) => {
      const arr = Array.isArray(cur) ? cur : [];
      return normalizePantries([...arr, { id, name: n, items: [], text: "" }]);
    });
    setActivePantryIdState(id);
  }, []);

  return {
    pantries,
    activePantryId,
    activePantry,
    setActivePantryId,
    addLine,
    applyParsedItems,
    removeItemAt,
    restoreItemAt,
    addPantry,
    refresh,
  };
}
