/**
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
import { useAuth } from "../../../core/auth/AuthContext";
import { bootNutritionSqliteReadPath } from "../lib/sqliteReadBoot";
import { notifyNutritionSqliteCacheRefresh } from "../lib/sqliteReadGate";

export function useNutritionSqliteReadBoot(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;
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
