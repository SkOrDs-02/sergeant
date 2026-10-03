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
    const payload = writeFizrukQuickStatsSnapshot(workouts);
    lastWrittenRef.current = payload;
  }, [workouts]);
}

/**
 * Same write, without the React lifecycle — щоб знімок можна було відновити
 * поза екраном модуля (див. `useFizrukQuickStatsBoot`). Повертає записаний
 * payload, тож викликач може тримати власний dedupe-ref.
 */
export function writeFizrukQuickStatsSnapshot(workouts: Workout[]): string {
  const payload = JSON.stringify(computeFizrukQuickStats(workouts));
  if (safeReadStringLS(STORAGE_KEYS.FIZRUK_QUICK_STATS) === payload) {
    return payload;
  }
  if (safeWriteLS(STORAGE_KEYS.FIZRUK_QUICK_STATS, payload)) {
    emitHubBus("storageUpdated", undefined);
  }
  return payload;
}
