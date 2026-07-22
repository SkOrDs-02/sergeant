/**
 * Last validated: 2026-06-15
 * Status: Active
 * React hook that boots the SQLite read path for Харчування.
 *
 * PR #033 of `docs/planning/storage-roadmap.md`. When the
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
import { useLocalUserId } from "../../../core/auth/useLocalUserId";
import { bootNutritionSqliteReadPath } from "../lib/sqliteReadBoot";
import { notifyNutritionSqliteCacheRefresh } from "../lib/sqliteReadGate";

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

    void bootNutritionSqliteReadPath(userId).then((activated) => {
      if (activated) {
        // Notify consumers (useNutritionLog / useNutritionPantries /
        // useNutritionPrefs / saved-recipe hooks) that the cache is
        // fresh so they re-render with the SQLite overlay.
        notifyNutritionSqliteCacheRefresh();
      }
    });
  }, [userId]);
}
