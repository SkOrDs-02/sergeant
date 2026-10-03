/**
 * Last validated: 2026-10-02
 * Status: Active
 *
 * React-обгортки над `isNutritionPrefsHydrated()` (data-04).
 *
 * Гідратація змінюється двома незалежними подіями: кеш Їжі отримав рядок prefs
 * (тік `useNutritionSqliteReadTick`) і завершився початковий pull
 * (`subscribeInitialPull`). Хук підписаний на обидві, тож Settings-секції й
 * хуки Їжі перерендерюються без поллінгу.
 */
import { useSyncExternalStore } from "react";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import {
  getInitialPullVersion,
  subscribeInitialPull,
} from "../../../core/syncEngine/initialPullState.js";
import {
  isNutritionPrefsHydrated,
  loadLatestNutritionPrefs,
} from "../lib/nutritionStorage";
import { useNutritionSqliteReadTick } from "../lib/sqliteReadGate";

/** `true`, коли prefs гідратовано і їх можна показувати/писати. */
export function useNutritionPrefsHydrated(): boolean {
  // Обидва виклики — лише підписки: значення читається з модульного стану.
  useNutritionSqliteReadTick();
  useSyncExternalStore(
    subscribeInitialPull,
    getInitialPullVersion,
    getInitialPullVersion,
  );
  return isNutritionPrefsHydrated();
}

export interface NutritionPrefsSnapshot {
  readonly prefs: NutritionPrefs;
  readonly hydrated: boolean;
}

/**
 * Живі prefs (а не одноразове `useState(loadNutritionPrefs)`) разом із
 * прапором гідратації. Читає ОСТАННІЙ запис, поки кеш його не наздогнав, тож
 * рендер між записом і refresh кешу не показує застаріле значення. Для
 * Settings-секцій: до `hydrated` контроли блокуються, бо `prefs` там —
 * дефолти, а не дані акаунта.
 */
export function useNutritionPrefsSnapshot(): NutritionPrefsSnapshot {
  const hydrated = useNutritionPrefsHydrated();
  return { prefs: loadLatestNutritionPrefs(), hydrated };
}
