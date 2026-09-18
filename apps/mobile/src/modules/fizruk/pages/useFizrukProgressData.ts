/**
 * Stub data hook for the Fizruk Progress screen.
 *
 * Mirrors the Finyk
 * {@link import("../../finyk/pages/Overview/useFinykOverviewData.ts").useFinykOverviewData}
 * pattern: Phase 6 / PR-D lands the chart UI only, so this hook
 * returns an empty, schema-valid payload that drives the zero-state
 * branches of each section. A later PR swaps the internals for
 * MMKV-backed `useWorkouts` / `useMeasurements` hooks without having
 * to touch any screen-level component — the Progress UI just re-runs
 * with real data.
 */
import { useMemo } from "react";

import type {
  ProgressMeasurementInput,
  ProgressWorkoutInput,
} from "@sergeant/fizruk-domain/domain";

export interface FizrukProgressData {
  /** Raw workout sessions (newest- or oldest-first — selectors tolerate both). */
  workouts: readonly ProgressWorkoutInput[];
  /**
   * Measurement entries sorted newest-first (`at` desc), to match the
   * contract the web `useMeasurements()` hook already emits.
   */
  entries: readonly ProgressMeasurementInput[];
}

export function useFizrukProgressData(): FizrukProgressData {
  return useMemo<FizrukProgressData>(
    () => ({
      workouts: [],
      entries: [],
    }),
    [],
  );
}
