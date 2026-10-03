/**
 * Last validated: 2026-06-15
 * Status: Active
 * React hook that boots the SQLite read path for Харчування.
 *
 * PR #033 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`. When the
 * `feature.nutrition.sqlite_v2.read_sqlite` flag is on, this hook runs
 * `bootNutritionSqliteReadPath()` once after mount so subsequent reads
 * in `useNutritionLog` / `useNutritionPantries` / `useNutritionPrefs` /
 * saved-recipe hooks overlay from the local `nutrition_*` SQLite tables
 * instead of LS.
 *
 * Fire-and-forget — boot failures fall back to LS silently (console
 * warning only). The caller does NOT need to gate rendering on the
 * boot promise.
 *
 * Mirrors `apps/web/src/modules/fizruk/hooks/useFizrukSqliteReadBoot.ts`.
 */

import { useEffect, useRef } from "react";
import { logger } from "@shared/lib";
import { useLocalUserId } from "../../../core/auth/useLocalUserId";
import { bootNutritionSqliteReadPath } from "../lib/sqliteReadBoot";
import { notifyNutritionSqliteCacheRefresh } from "../lib/sqliteReadGate";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";

let bootSettled = false;

/**
 * Чи можна малювати дані Їжі: кеш уже прогрітий, АБО бут читання
 * завершився (успіхом чи провалом, тоді дані йдуть із LS).
 *
 * Гейт «бут у польоті» тут не годився: прапорець ставився в ефекті, тобто
 * вже після першого рендера сторінки, і холодний старт встигав показати
 * нулі до того, як скелетон узагалі мав шанс зʼявитись.
 *
 * AI-DANGER: `refreshedAt` на провалі бута лишається `null` назавжди, тож
 * гейт лише на ньому тримав би скелетон вічно. Вихід дає `bootSettled`.
 * Скелетон вічний лише тоді, коли хук не змонтований зовсім: його кличе
 * сам `NutritionApp`, тож на сторінках Їжі це неможливо.
 */
export function isNutritionReadCacheSettled(): boolean {
  return bootSettled || getCachedNutritionSqliteState().refreshedAt !== null;
}

/** Тест-хелпер: виставити «бут завершився» (і скинути між специфікаціями). */
export function __setNutritionReadBootSettledForTests(value: boolean): void {
  bootSettled = value;
}

export function useNutritionSqliteReadBoot(): void {
  // AI-CONTEXT: demo and anonymous sessions both bypass auth (no user
  // id), but the SQLite read-boot + residual `nutrition_*` LS->SQLite
  // drain are userId-gated. `useLocalUserId` hands out a synthetic id
  // for both, so the seeded demo payload reaches the read cache
  // (QA D-002) and an anonymous visitor reads back what
  // `useNutritionDualWriteBoot` wrote under the same id.
  const userId = useLocalUserId();
  const didBoot = useRef(false);

  useEffect(() => {
    if (didBoot.current || !userId) return;
    didBoot.current = true;

    const settle = () => {
      bootSettled = true;
      // Завжди, не лише при успіху: споживачі (useNutritionLog, комора,
      // prefs, рецепти) перемальовуються з SQLite-оверлеєм, а скелетон
      // старту Їжі тримається на `bootSettled`, і без сигналу про невдачу
      // він не зник би до релоаду.
      notifyNutritionSqliteCacheRefresh();
    };

    void bootNutritionSqliteReadPath(userId)
      .catch((error: unknown) => {
        logger.warn(
          "[nutrition.sqliteRead] boot rejected outside its own catch",
          error instanceof Error ? error.message : error,
        );
      })
      .finally(settle);
  }, [userId]);
}
