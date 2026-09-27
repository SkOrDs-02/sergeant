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

/**
 * Чи бут читання ЗАРАЗ У ПОЛЬОТІ. Той самий контракт, що й
 * `isFizrukReadBootInFlight`: саме «в польоті», а не «відпрацював».
 *
 * AI-DANGER: на провалі бута `refreshedAt` лишається `null` назавжди, тож
 * гейт скелетона на ньому самому виходу не мав би. Прапорець стартує з
 * `false`: бут не запустився або впав → споживач малює те, що має, і
 * найгірший випадок — спалах нулів, а не вічний скелетон.
 */
//
// Лічильник, а не булеан: хук стоїть і в `NutritionBootCluster`, і в
// `NutritionApp`, а другий виклик бута впирається в латч `booted` і
// вертається одразу. Булеан він скинув би в `false`, поки перший бут ще
// везе журнал, і скелетон зник би на нулях.
let bootsInFlight = 0;

/** @see bootsInFlight */
export function isNutritionReadBootInFlight(): boolean {
  return bootsInFlight > 0;
}

/** Тест-хелпер: виставити прапорець польоту (і скинути між специфікаціями). */
export function __setNutritionReadBootInFlightForTests(value: boolean): void {
  bootsInFlight = value ? 1 : 0;
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

    bootsInFlight += 1;
    const settle = () => {
      bootsInFlight -= 1;
      // Завжди, не лише при успіху: споживачі (useNutritionLog, комора,
      // prefs, рецепти) перемальовуються з SQLite-оверлеєм, а скелетон
      // старту Їжі тримається на прапорці, і без сигналу про невдачу він не
      // зник би до релоаду.
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
