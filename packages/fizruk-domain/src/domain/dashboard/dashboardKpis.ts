/**
 * Pure aggregator for the Fizruk **Dashboard** KPI strip.
 *
 * All inputs are loosely typed so the various persisted workout /
 * measurement shapes on web and mobile can be passed through without
 * adapter layers. `now` is a seam — tests freeze the clock by passing
 * a known timestamp (`new Date("2026-04-20T12:00:00Z")`).
 *
 * KPIs computed here:
 *  - `streakDays` — consecutive local-day run of workouts ending today
 *    (or yesterday, when today is a rest day).
 *  - `weeklyWorkoutsCount` / `weeklyVolumeKg` — Mon-first current-week
 *    totals.
 *  - `totalCompletedCount`, `avgDurationSec`, `latestWorkoutIso` —
 *    all-time aggregates over completed workouts.
 *  - `weightChangeKg` — signed delta across a user-configurable
 *    window (default 30 days).
 */

import type {
  DashboardKpis,
  DashboardMeasurementInput,
  DashboardWorkoutInput,
} from "./types.js";

/** Default lookback window for `weightChangeKg`. */
export const DEFAULT_WEIGHT_WINDOW_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toFiniteNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function localYmdKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mondayStartMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // 0 = Mon
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

function isCompletedWorkout(
  w: DashboardWorkoutInput,
): w is DashboardWorkoutInput & {
  endedAt: string;
} {
  return typeof w?.endedAt === "string" && w.endedAt.length > 0;
}

function workoutVolumeKg(w: DashboardWorkoutInput): number {
  let vol = 0;
  const items = w?.items ?? [];
  for (const item of items) {
    if (item?.type !== "strength") continue;
    const sets = item?.sets ?? [];
    for (const s of sets) {
      const weight = toFiniteNumber(s?.weightKg);
      const reps = toFiniteNumber(s?.reps);
      if (weight == null || reps == null) continue;
      if (weight <= 0 || reps <= 0) continue;
      vol += weight * reps;
    }
  }
  return vol;
}

function workoutDurationSec(w: DashboardWorkoutInput, nowMs: number): number {
  const start =
    typeof w?.startedAt === "string" ? Date.parse(w.startedAt) : NaN;
  if (!Number.isFinite(start)) return 0;
  const end =
    typeof w?.endedAt === "string" && w.endedAt ? Date.parse(w.endedAt) : nowMs;
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 1000));
}

/**
 * Consecutive local-day streak of completed workouts.
 *
 * Walks backwards from `now` — day 0 is today, day 1 is yesterday,
 * etc. The streak extends as long as at least one workout has
 * `endedAt` falling on the candidate local day. When today is empty,
 * the streak can still start from yesterday (i.e. the user gets a
 * 1-day grace period for the current day). Returns `0` when neither
 * today nor yesterday has any completed workouts.
 */
export function computeStreakDays(
  workouts: readonly DashboardWorkoutInput[] | null | undefined,
  now: Date = new Date(),
): number {
  const list = Array.isArray(workouts) ? workouts : [];
  if (list.length === 0) return 0;

  const daysWithWorkouts = new Set<string>();
  for (const w of list) {
    if (!isCompletedWorkout(w)) continue;
    const ms = Date.parse(w.endedAt);
    if (!Number.isFinite(ms)) continue;
    daysWithWorkouts.add(localYmdKey(ms));
  }
  if (daysWithWorkouts.size === 0) return 0;

  const base = new Date(now);
  base.setHours(12, 0, 0, 0);
  const todayMs = base.getTime();
  const todayKey = localYmdKey(todayMs);

  let startOffset = 0;
  if (!daysWithWorkouts.has(todayKey)) {
    const yMs = todayMs - MS_PER_DAY;
    if (!daysWithWorkouts.has(localYmdKey(yMs))) return 0;
    startOffset = 1;
  }

  let streak = 0;
  for (let i = startOffset; i < 365; i++) {
    const key = localYmdKey(todayMs - i * MS_PER_DAY);
    if (!daysWithWorkouts.has(key)) break;
    streak += 1;
  }
  return streak;
}

/**
 * Current Mon-first-week counts (completed workouts + volume).
 */
export function computeWeeklyTotals(
  workouts: readonly DashboardWorkoutInput[] | null | undefined,
  now: Date = new Date(),
): { readonly count: number; readonly volumeKg: number } {
  const list = Array.isArray(workouts) ? workouts : [];
  if (list.length === 0) return { count: 0, volumeKg: 0 };

  const weekStart = mondayStartMs(now.getTime());
  const weekEnd = weekStart + 7 * MS_PER_DAY;

  let count = 0;
  let volumeKg = 0;
  for (const w of list) {
    if (!isCompletedWorkout(w)) continue;
    const ms = Date.parse(w.endedAt);
    if (!Number.isFinite(ms)) continue;
    if (ms < weekStart || ms >= weekEnd) continue;
    count += 1;
    volumeKg += workoutVolumeKg(w);
  }
  return { count, volumeKg };
}

/**
 * Latest completed-workout timestamp (ISO) + all-time averages.
 */
function computeAllTimeWorkoutStats(
  workouts: readonly DashboardWorkoutInput[] | null | undefined,
  now: Date,
): {
  readonly totalCompletedCount: number;
  readonly avgDurationSec: number;
  readonly latestWorkoutIso: string | null;
} {
  const list = Array.isArray(workouts) ? workouts : [];
  if (list.length === 0) {
    return {
      totalCompletedCount: 0,
      avgDurationSec: 0,
      latestWorkoutIso: null,
    };
  }

  let total = 0;
  let durSum = 0;
  let latestMs = -Infinity;
  let latestIso: string | null = null;
  const nowMs = now.getTime();

  for (const w of list) {
    if (!isCompletedWorkout(w)) continue;
    total += 1;
    durSum += workoutDurationSec(w, nowMs);
    const ms = Date.parse(w.endedAt);
    if (Number.isFinite(ms) && ms > latestMs) {
      latestMs = ms;
      latestIso = w.endedAt;
    }
  }

  return {
    totalCompletedCount: total,
    avgDurationSec: total > 0 ? Math.round(durSum / total) : 0,
    latestWorkoutIso: latestIso,
  };
}

/**
 * Signed weight delta over the last `windowDays` (default 30).
 * Uses the oldest and newest measurement whose `at` falls inside the
 * window. Returns `null` when fewer than two in-window samples are
 * present.
 */
export function computeWeightChangeKg(
  measurements: readonly DashboardMeasurementInput[] | null | undefined,
  options: { readonly windowDays?: number; readonly now?: Date } = {},
): number | null {
  const { windowDays = DEFAULT_WEIGHT_WINDOW_DAYS, now = new Date() } = options;
  const list = Array.isArray(measurements) ? measurements : [];
  if (list.length === 0) return null;

  const nowMs = now.getTime();
  const windowStart = nowMs - Math.max(1, windowDays) * MS_PER_DAY;

  const samples: Array<{ ms: number; weight: number }> = [];
  for (const entry of list) {
    if (!entry || typeof entry.at !== "string") continue;
    const ms = Date.parse(entry.at);
    if (!Number.isFinite(ms)) continue;
    if (ms < windowStart || ms > nowMs) continue;
    const weight = toFiniteNumber(entry.weightKg);
    if (weight == null) continue;
    samples.push({ ms, weight });
  }

  if (samples.length < 2) return null;
  samples.sort((a, b) => a.ms - b.ms);
  // Інваріант `length >= 2` гарантує, що `first`/`last` визначені;
  // під strict-index `arr[i]` повертає `T | undefined`, тому фіксуємо
  // intent явним narrow-ом замість non-null assertion.
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last) return null;
  return Math.round((last.weight - first.weight) * 100) / 100;
}

export interface ComputeDashboardKpisOptions {
  readonly measurements?: readonly DashboardMeasurementInput[] | null;
  readonly now?: Date;
  readonly weightWindowDays?: number;
}

/**
 * Main dashboard aggregator — wraps all of the above into a single
 * `DashboardKpis` payload. Safe to call with `null` / `undefined`
 * inputs; returns a well-formed zero-state in that case.
 */
export function computeDashboardKpis(
  workouts: readonly DashboardWorkoutInput[] | null | undefined,
  options: ComputeDashboardKpisOptions = {},
): DashboardKpis {
  const {
    measurements = null,
    now = new Date(),
    weightWindowDays = DEFAULT_WEIGHT_WINDOW_DAYS,
  } = options;

  const { count: weeklyWorkoutsCount, volumeKg: weeklyVolumeKg } =
    computeWeeklyTotals(workouts, now);
  const { totalCompletedCount, avgDurationSec, latestWorkoutIso } =
    computeAllTimeWorkoutStats(workouts, now);

  return {
    streakDays: computeStreakDays(workouts, now),
    weeklyWorkoutsCount,
    weeklyVolumeKg: Math.round(weeklyVolumeKg),
    totalCompletedCount,
    avgDurationSec,
    latestWorkoutIso,
    weightChangeKg: computeWeightChangeKg(measurements, {
      windowDays: weightWindowDays,
      now,
    }),
    weightWindowDays,
  };
}
