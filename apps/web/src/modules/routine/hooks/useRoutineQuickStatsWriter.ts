import { useEffect, useRef } from "react";
import { STORAGE_KEYS } from "@sergeant/shared";
import { computeRoutineQuickStats } from "@sergeant/routine-domain";
import type { Habit, HabitSkip } from "@sergeant/routine-domain";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { anchoredTodayKey } from "../lib/dayAnchor";

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
 * device-local day boundary (ADR-0078). A `storageUpdated` bump lets any
 * same-tab Hub consumer re-read immediately.
 */
export function useRoutineQuickStatsWriter({
  habits,
  completions,
  skips,
}: {
  habits: Habit[];
  completions: Record<string, string[]>;
  skips?: Record<string, Record<string, HabitSkip>> | undefined;
}): void {
  const lastWrittenRef = useRef<string | null>(null);

  useEffect(() => {
    lastWrittenRef.current = writeRoutineQuickStatsSnapshot({
      habits,
      completions,
      skips,
    });
  }, [habits, completions, skips]);
}

/**
 * Same write, без React-життєвого циклу — щоб знімок можна було відновити
 * поза екраном модуля (див. `useRoutineQuickStatsBoot`).
 */
export function writeRoutineQuickStatsSnapshot({
  habits,
  completions,
  skips,
}: {
  habits: Habit[];
  completions: Record<string, string[]>;
  skips?: Record<string, Record<string, HabitSkip>> | undefined;
}): string {
  // Той самий анкер доби, що й решта web-routine (`lib/dayAnchor.ts`), не
  // окремий прямий виклик (unification audit 2026-08-31, finding 2.3).
  // `skips` — щоб Hub-картка рахувала «N з M» і стрік так само, як герой
  // модуля: без цього поля пропуск «не зміг» рахувався провалом, а стрік —
  // жорстким (findings 1.5/1.6).
  const payload = JSON.stringify(
    computeRoutineQuickStats(habits, completions, anchoredTodayKey(), skips),
  );
  if (safeReadStringLS(STORAGE_KEYS.ROUTINE_QUICK_STATS) === payload) {
    return payload;
  }
  if (safeWriteLS(STORAGE_KEYS.ROUTINE_QUICK_STATS, payload)) {
    emitHubBus("storageUpdated", undefined);
  }
  return payload;
}
