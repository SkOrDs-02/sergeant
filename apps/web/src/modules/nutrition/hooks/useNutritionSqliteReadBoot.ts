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
import { useAuth } from "../../../core/auth/AuthContext";
import {
  DEMO_LOCAL_USER_ID,
  isDemoActive,
} from "../../../core/onboarding/onboardingGate";
import { bootNutritionSqliteReadPath } from "../lib/sqliteReadBoot";
import { notifyNutritionSqliteCacheRefresh } from "../lib/sqliteReadGate";

export function useNutritionSqliteReadBoot(): void {
  const { user } = useAuth();
  // AI-CONTEXT: demo mode bypasses auth (no user id), but the SQLite
  // read-boot + residual `nutrition_*` LS->SQLite drain are
  // userId-gated. Falling back to a synthetic demo id lets the seeded
  // demo payload reach the read cache, so the Nutrition module is not
  // empty while the hub card shows the seeded kcal/goal stats (QA D-002).
  const userId = user?.id ?? (isDemoActive() ? DEMO_LOCAL_USER_ID : null);
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
