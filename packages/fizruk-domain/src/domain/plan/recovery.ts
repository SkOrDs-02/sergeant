/**
 * Pure recovery-forecast helper for the Fizruk monthly plan view.
 *
 * For every supplied local-date key, evaluates the user's recovery state
 * using only the workouts logged up to and including that day, then
 * classifies the whole day into one of three bucket statuses so the
 * `PlanCalendar` can render a heat-indicator per cell:
 *
 *   - `"fresh"`     — no qualifying workouts within `freshThresholdDays`
 *                     (no recent training load → nothing to recover).
 *   - `"ready"`     — workouts exist within the window but every muscle
 *                     group is `"green"` or `"yellow"` (fatigue has
 *                     decayed enough to train again).
 *   - `"overworked"` — at least one muscle group is still `"red"` (too
 *                     much load / too recent / low wellbeing) and should
 *                     be rested.
 *
 * DOM-free and storage-free: both mobile (`apps/mobile`) and web
 * (`apps/web`) import the helper and feed it their already-loaded
 * workouts + daily-log arrays. A `nowMs` seam keeps the function
 * deterministic under jest / vitest.
 *
 * Builds on top of `computeRecoveryBy` from `lib/recoveryCompute.ts`
 * (which already handles per-exercise tonnage, secondary-muscle
 * weighting, exponential fatigue decay and wellbeing multipliers) — we
 * only add the per-day filtering and bucket classification here so the
 * two stay in sync as the recovery formula evolves.
 */

import { kyivDayEndMs } from "@sergeant/shared";
import {
  computeRecoveryBy,
  type MuscleState,
  type RecoveryStatus,
} from "../../lib/recoveryCompute.js";
import type { DailyLogEntry, Workout } from "../types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Classification of a single calendar day from the recovery-forecast lens. */
export type DayRecoveryStatus = "fresh" | "ready" | "overworked";

/** Compact per-muscle summary included in a day forecast. */
export interface DayRecoveryMuscle {
  /** Muscle group id (matches the `musclesUk` key set). */
  id: string;
  /** User-facing label (falls back to `id` when the label map is empty). */
  label: string;
  /** Underlying recovery status (green | yellow | red). */
  status: RecoveryStatus;
  /** Whole days since this muscle was last loaded, or null if never. */
  daysSince: number | null;
}

/** Forecast entry for one calendar day. */
export interface DayRecoveryForecast {
  /** Local-date key (`YYYY-MM-DD`) this forecast is keyed by. */
  dateKey: string;
  /** Bucket status used to paint the heat-indicator. */
  status: DayRecoveryStatus;
  /** Muscles currently red on that day (sorted by `daysSince` asc). */
  overworkedMuscles: DayRecoveryMuscle[];
  /** Muscles green/yellow within the fresh window (sorted by `daysSince` asc). */
  recoveredMuscles: DayRecoveryMuscle[];
  /**
   * True when the muscle map is empty (no workouts ever logged within the
   * window). Lets the caller render a slightly softer empty-state badge.
   */
  noRecentTraining: boolean;
}

/** Configuration for {@link computeRecoveryForecast}. */
export interface RecoveryForecastOptions {
  /** Deterministic "now" seam in ms (defaults to `Date.now()`). */
  nowMs?: number;
  /**
   * Optional daily-log entries (sleep / energy) forwarded to
   * `computeRecoveryBy` so poor sleep widens the red window, as it does
   * in the existing `useRecovery` hook.
   */
  dailyLogEntries?: ReadonlyArray<Partial<DailyLogEntry>>;
  /**
   * How many days back from `dateKey` still counts as "recent training"
   * for the bucket decision. Default 7. When every qualifying muscle
   * was loaded further back than this, the day is `"fresh"`.
   */
  freshThresholdDays?: number;
}

/** Validate a `"YYYY-MM-DD"` key (incl. roll-over dates like Feb 30). */
function isValidDateKey(key: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  // UTC round-trip rejects out-of-range days that silently roll over
  // (e.g. Feb 30 → Mar 2).
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === mo - 1 &&
    probe.getUTCDate() === d
  );
}

/**
 * End-of-day timestamp for `dateKey` in **Europe/Kyiv** — the instant we
 * evaluate recovery at. Using 23:59:59.999 makes workouts that started
 * that very day count toward the day's load (rather than slipping into
 * the next calendar cell). Kyiv-anchored so the evaluation point doesn't
 * drift with the runtime timezone (domain invariant).
 */
function endOfLocalDateMs(dateKey: string): number | null {
  if (!isValidDateKey(dateKey)) return null;
  return kyivDayEndMs(dateKey);
}

function toMuscleSummary(m: MuscleState): DayRecoveryMuscle {
  return {
    id: m.id,
    label: m.label,
    status: m.status,
    daysSince: m.daysSince,
  };
}

/** Stable asc-sort by `daysSince` with nulls last, tie-break by id. */
function byDaysSince(a: DayRecoveryMuscle, b: DayRecoveryMuscle): number {
  const ad = a.daysSince ?? Number.POSITIVE_INFINITY;
  const bd = b.daysSince ?? Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad - bd;
  return a.id.localeCompare(b.id);
}

/**
 * For each supplied local-date key, classify the user's recovery state
 * at that day into `"fresh" | "ready" | "overworked"` and surface the
 * offending / recovered muscle lists for tooltip / sheet summaries.
 *
 * The helper is pure: it never touches storage, DOM or wall-clock time
 * except through the explicit `nowMs` seam, so both platforms and all
 * unit-test suites can feed it fixture data directly.
 */
export function computeRecoveryForecast(
  dateKeys: readonly string[],
  workouts: ReadonlyArray<Partial<Workout>>,
  musclesUk: Record<string, string>,
  options: RecoveryForecastOptions = {},
): Record<string, DayRecoveryForecast> {
  const freshThresholdDays = Math.max(0, options.freshThresholdDays ?? 7);
  const dailyLogEntries = options.dailyLogEntries ?? [];

  const out: Record<string, DayRecoveryForecast> = {};
  if (!Array.isArray(dateKeys) || dateKeys.length === 0) return out;

  // Pre-parse each workout's startedAt once so per-day filtering is
  // O(D + W) rather than O(D × W) of re-parsing the same ISO strings.
  const parsedWorkouts: Array<{
    startedMs: number;
    workout: Partial<Workout>;
  }> = [];
  for (const w of workouts ?? []) {
    const t = w?.startedAt ? Date.parse(w.startedAt) : NaN;
    if (Number.isFinite(t)) parsedWorkouts.push({ startedMs: t, workout: w });
  }
  // Sort ascending so the per-day slice is a monotonic prefix scan.
  parsedWorkouts.sort((a, b) => a.startedMs - b.startedMs);

  for (const key of dateKeys) {
    const evalMs = endOfLocalDateMs(key);
    if (evalMs == null) continue;

    // Only workouts that had already started by end-of-day count.
    const sliced: Array<Partial<Workout>> = [];
    for (const p of parsedWorkouts) {
      if (p.startedMs <= evalMs) sliced.push(p.workout);
      else break;
    }

    const by = computeRecoveryBy(
      sliced,
      musclesUk,
      evalMs,
      // `computeRecoveryBy` wants a mutable array; shallow-copy the
      // read-only option so callers can safely pass a frozen list
      // (e.g. the one mirrored from MMKV).
      [...dailyLogEntries],
    );
    const states = Object.values(by);

    const thresholdMs = freshThresholdDays * DAY_MS;

    const overworked: DayRecoveryMuscle[] = [];
    const recovered: DayRecoveryMuscle[] = [];
    let recentlyTrained = 0;

    for (const m of states) {
      if (m.lastAt == null) continue;
      const within = evalMs - m.lastAt <= thresholdMs;
      if (!within) continue;
      recentlyTrained += 1;
      if (m.status === "red") {
        overworked.push(toMuscleSummary(m));
      } else {
        recovered.push(toMuscleSummary(m));
      }
    }

    overworked.sort(byDaysSince);
    recovered.sort(byDaysSince);

    let status: DayRecoveryStatus;
    if (recentlyTrained === 0) status = "fresh";
    else if (overworked.length > 0) status = "overworked";
    else status = "ready";

    out[key] = {
      dateKey: key,
      status,
      overworkedMuscles: overworked,
      recoveredMuscles: recovered,
      noRecentTraining: recentlyTrained === 0,
    };
  }

  return out;
}

/** Localised (uk-UA) textual description, safe for `accessibilityLabel`. */
export function describeDayRecovery(
  forecast: DayRecoveryForecast | null | undefined,
): string {
  if (!forecast) return "Немає даних про відновлення";

  if (forecast.status === "fresh") {
    return "Відновлення: немає недавніх тренувань";
  }

  if (forecast.status === "overworked") {
    const names = forecast.overworkedMuscles
      .slice(0, 3)
      .map((m) => m.label)
      .join(", ");
    const suffix = names ? ` (${names})` : "";
    return `Відновлення: перевантаження${suffix}, рекомендовано відпочити`;
  }

  const names = forecast.recoveredMuscles
    .slice(0, 3)
    .map((m) => m.label)
    .join(", ");
  const suffix = names ? ` (${names})` : "";
  return `Відновлення: готовий до тренування${suffix}`;
}
