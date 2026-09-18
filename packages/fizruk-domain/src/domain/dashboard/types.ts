/**
 * Shared domain types for the Fizruk **Dashboard** page.
 *
 * Platform-neutral — consumed by `apps/web` (future port) and
 * `apps/mobile` (Phase 6 Dashboard PR). All selectors here take
 * loosely-typed input so the various persisted shapes on either
 * platform can pass through without casting.
 *
 * Phase-6 scope (mobile Dashboard port):
 *  - KPI strip (streak / weekly volume / weight change).
 *  - "Next session" lookup over the monthly plan.
 *  - Top-N personal records derived from workouts.
 *  - Recent-workout summary cards.
 */

import type { ProgressWorkoutInput } from "../progress/types.js";

/** Workout payload accepted by dashboard selectors (alias for Progress shape). */
export type DashboardWorkoutInput = ProgressWorkoutInput;

/**
 * Measurement payload accepted by dashboard selectors. Intentionally
 * narrower than `ProgressMeasurementInput` (no `[key: string]:
 * unknown` index signature) so strict readonly shapes like
 * `MobileMeasurementEntry` flow in without an adapter cast.
 */
export interface DashboardMeasurementInput {
  readonly at: string;
  readonly weightKg?: number | string | null;
}

/**
 * Minimal shape of a workout template the dashboard "next session"
 * resolver needs — just id / name / length. Both the web
 * `WorkoutTemplate` and the mobile MMKV record satisfy it.
 */
export interface DashboardTemplateLike {
  readonly id: string;
  readonly name?: string | null;
  readonly exerciseIds?: readonly string[] | null;
}

/**
 * Computed KPI strip (streak / weekly volume / weight delta) shown
 * across the top of the dashboard.
 */
export interface DashboardKpis {
  /**
   * Consecutive local days (including today) on which ≥1 workout
   * was completed. `0` when today is not a workout day and there
   * was no workout yesterday.
   */
  readonly streakDays: number;
  /**
   * Тижнів поспіль із ≥`streakTargetPerWeek` завершених тренувань, київські
   * межі тижня (канон `fizruk.md` §7 — «стрік має бути тижневим/гнучким»).
   *
   * Це число показує веб. `streakDays` лишається у payload-і для мобілки,
   * яка поза скоупом за рішенням власника 2026-07-30, — і саме воно карає
   * за правильний день відпочинку.
   */
  readonly streakWeeks: number;
  /** Поріг, за яким рахувався `streakWeeks`. */
  readonly streakTargetPerWeek: number;
  /** Завершених тренувань у поточному (незакритому) тижні. */
  readonly currentWeekWorkouts: number;
  /** Поточний тиждень ще не дотяг до порогу, але триває — це не обрив. */
  readonly currentWeekPending: boolean;
  /** Number of completed workouts whose `endedAt` falls in the current Mon-first week. */
  readonly weeklyWorkoutsCount: number;
  /** Sum of `weightKg × reps` over every strength set in the current Mon-first week. */
  readonly weeklyVolumeKg: number;
  /** Total count of completed (`endedAt` set) workouts across all time. */
  readonly totalCompletedCount: number;
  /** Average duration (seconds) of completed workouts, or `0` when none. */
  readonly avgDurationSec: number;
  /** ISO timestamp of the most-recent completed workout (or `null`). */
  readonly latestWorkoutIso: string | null;
  /**
   * Signed weight delta (kg) between the oldest and newest measurement
   * whose `at` falls inside the window. `null` when fewer than two
   * samples are present.
   */
  readonly weightChangeKg: number | null;
  /** Length of the window used to compute `weightChangeKg`, in days. */
  readonly weightWindowDays: number;
}

/** One row in the "Recent PRs" section. */
export interface DashboardPRItem {
  readonly exerciseId: string;
  /** Best-effort exercise display name (from `item.nameUk`), or `null` when unknown. */
  readonly nameUk: string | null;
  /** Best Epley-estimated 1RM across all sets recorded for this exercise. */
  readonly oneRmKg: number;
  /** Weight (kg) of the top set that produced the PR. */
  readonly weightKg: number;
  /** Reps of the top set that produced the PR. */
  readonly reps: number;
  /** ISO timestamp of the workout where the PR set was recorded. */
  readonly atIso: string | null;
}

/** Row in the "Recent workouts" section. */
export interface DashboardRecentWorkout {
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly durationSec: number;
  readonly itemsCount: number;
  readonly tonnageKg: number;
  /** Free-form note or first exercise name, or a fallback "Тренування". */
  readonly label: string;
}

/** Resolved "next session" card payload. */
export interface DashboardNextSession {
  /** Local `YYYY-MM-DD` of the resolved session. */
  readonly dateKey: string;
  /** Days from today (`0` = today, `1` = tomorrow, …). */
  readonly daysFromNow: number;
  /** Convenience flag: `daysFromNow === 0`. */
  readonly isToday: boolean;
  /** Template id assigned to that date. */
  readonly templateId: string;
  /** Template display name (falls back to `"Тренування"`). */
  readonly templateName: string;
  /** Exercises in the template (or `null` when the catalogue does not know). */
  readonly exerciseCount: number | null;
}
