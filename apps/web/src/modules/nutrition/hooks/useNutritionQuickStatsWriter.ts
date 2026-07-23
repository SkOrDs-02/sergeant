import { useEffect, useRef } from "react";
import { STORAGE_KEYS } from "@sergeant/shared";
import { computeNutritionQuickStats } from "@sergeant/nutrition-domain";
import type { NutritionLog, NutritionPrefs } from "@sergeant/nutrition-domain";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";

/**
 * Production writer for the Hub nutrition quick-stats snapshot.
 *
 * The Hub bento card reads `todayCal` / `calGoal` from
 * `STORAGE_KEYS.NUTRITION_QUICK_STATS`, but the only historic writer was the
 * onboarding demo seeder — so a real user's card stayed on the empty-state
 * promise no matter how many meals they logged (test-observations A1).
 *
 * Mounted once at the nutrition module root, this recomputes the snapshot
 * whenever the log or prefs change and writes it back on the Europe/Kyiv day
 * boundary. A `storageUpdated` bump lets any same-tab Hub consumer re-read
 * immediately.
 */
export function useNutritionQuickStatsWriter({
  log,
  prefs,
}: {
  log: NutritionLog;
  prefs: NutritionPrefs;
}): void {
  const lastWrittenRef = useRef<string | null>(null);

  useEffect(() => {
    const stats = computeNutritionQuickStats(log, prefs, getKyivDayKey());
    const payload = JSON.stringify(stats);
    if (payload === lastWrittenRef.current) return;
    if (safeReadStringLS(STORAGE_KEYS.NUTRITION_QUICK_STATS) === payload) {
      lastWrittenRef.current = payload;
      return;
    }
    if (safeWriteLS(STORAGE_KEYS.NUTRITION_QUICK_STATS, payload)) {
      lastWrittenRef.current = payload;
      emitHubBus("storageUpdated", undefined);
    }
  }, [log, prefs]);
}
