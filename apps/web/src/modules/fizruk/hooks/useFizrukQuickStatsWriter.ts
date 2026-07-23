import { useEffect, useRef } from "react";
import { STORAGE_KEYS } from "@sergeant/shared";
import { computeFizrukQuickStats } from "@sergeant/fizruk-domain/domain";
import type { Workout } from "@sergeant/fizruk-domain/domain";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import { emitHubBus } from "@shared/lib/modules/hubBus";

/**
 * Production writer for the Hub fizruk quick-stats snapshot.
 *
 * The Hub bento card reads `weekWorkouts` / `streak` from
 * `STORAGE_KEYS.FIZRUK_QUICK_STATS`, but the only historic writer was the
 * onboarding demo seeder — so a real user's card stayed on the empty-state
 * promise no matter how many workouts they logged (test-observations A1).
 *
 * Mounted once at the fizruk module root, this recomputes the snapshot
 * whenever the workout list changes and writes it back. The Kyiv Mon-first
 * week boundary lives in `computeWeeklyTotals`; a `storageUpdated` bump lets
 * any same-tab Hub consumer re-read immediately.
 */
export function useFizrukQuickStatsWriter(workouts: Workout[]): void {
  const lastWrittenRef = useRef<string | null>(null);

  useEffect(() => {
    const stats = computeFizrukQuickStats(workouts);
    const payload = JSON.stringify(stats);
    if (payload === lastWrittenRef.current) return;
    if (safeReadStringLS(STORAGE_KEYS.FIZRUK_QUICK_STATS) === payload) {
      lastWrittenRef.current = payload;
      return;
    }
    if (safeWriteLS(STORAGE_KEYS.FIZRUK_QUICK_STATS, payload)) {
      lastWrittenRef.current = payload;
      emitHubBus("storageUpdated", undefined);
    }
  }, [workouts]);
}
