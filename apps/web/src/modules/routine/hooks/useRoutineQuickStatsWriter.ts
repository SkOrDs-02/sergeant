import { useEffect, useRef } from "react";
import { STORAGE_KEYS } from "@sergeant/shared";
import { computeRoutineQuickStats } from "@sergeant/routine-domain";
import type { Habit } from "@sergeant/routine-domain";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";

/**
 * Production writer for the Hub routine quick-stats snapshot.
 *
 * The Hub bento card reads `todayDone` / `todayTotal` / `streak` from
 * `STORAGE_KEYS.ROUTINE_QUICK_STATS`, but the only historic writer was the
 * onboarding demo seeder — so a real user's card stayed on the empty-state
 * promise no matter how many habits they tracked (test-observations A1).
 *
 * Mounted once at the routine module root, this recomputes the snapshot
 * whenever habits or completions change and writes it back on the
 * Europe/Kyiv day boundary. A `storageUpdated` bump lets any same-tab Hub
 * consumer re-read immediately.
 */
export function useRoutineQuickStatsWriter({
  habits,
  completions,
}: {
  habits: Habit[];
  completions: Record<string, string[]>;
}): void {
  const lastWrittenRef = useRef<string | null>(null);

  useEffect(() => {
    const stats = computeRoutineQuickStats(
      habits,
      completions,
      getKyivDayKey(),
    );
    const payload = JSON.stringify(stats);
    if (payload === lastWrittenRef.current) return;
    if (safeReadStringLS(STORAGE_KEYS.ROUTINE_QUICK_STATS) === payload) {
      lastWrittenRef.current = payload;
      return;
    }
    if (safeWriteLS(STORAGE_KEYS.ROUTINE_QUICK_STATS, payload)) {
      lastWrittenRef.current = payload;
      emitHubBus("storageUpdated", undefined);
    }
  }, [habits, completions]);
}
