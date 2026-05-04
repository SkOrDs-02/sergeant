/**
 * Pure selectors backing the Fizruk **Exercise detail** page (web + mobile).
 *
 * Hoisted from `apps/web/src/modules/fizruk/pages/Exercise.tsx` so both
 * platforms share the same aggregation contract for:
 *   - per-exercise set history (newest-first),
 *   - personal record + "last top" set tracking + PR detection,
 *   - strength weekly trend (Monday-start buckets, capped at 12 weeks),
 *   - cardio (distance) trend buckets (pace / distance),
 *   - load-calculator zones (strength / hypertrophy / endurance).
 *
 * Kept DOM-free: no `window` / `localStorage` / `Intl.DateTimeFormat`
 * consumers here. Date labels are formatted via `Date#toLocaleDateString`
 * which is safe in Node and React Native runtimes.
 */

import {
  epley1rm,
  suggestNextSet as suggestNextSetJs,
} from "../../lib/workoutStats.js";
import type { Workout, WorkoutItem, WorkoutSet } from "./types.js";

/** Typed wrapper around the legacy JS `suggestNextSet` helper. */
export interface SuggestedNextSet {
  weightKg: number;
  reps: number;
  altWeightKg?: number | null;
  altReps?: number | null;
}

/**
 * Typed re-export of {@link suggestNextSetJs} so TS consumers (mobile,
 * web) get a proper shape without resorting to `any`. Behaviour is
 * identical to the legacy helper; `null` means "not enough data".
 */
export function suggestExerciseNextSet(
  lastBestSet: Pick<WorkoutSet, "weightKg" | "reps"> | null | undefined,
): SuggestedNextSet | null {
  const result = suggestNextSetJs(
    lastBestSet ?? null,
  ) as SuggestedNextSet | null;
  return result ?? null;
}

const WEEK_BUCKET_CAP = 12;

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatUkDateShort(d: Date): string {
  try {
    return d.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
  } catch {
    // Fallback for minimal ICU runtimes — YYYY-MM-DD prefix.
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
  }
}

/** Pair of a parent workout and one of its items matching the target exercise. */
export interface ExerciseHistoryEntry {
  workout: Workout;
  item: WorkoutItem;
}

/** Heaviest 1RM-equivalent set recorded for an exercise, with its timestamp. */
export interface ExerciseBestSet extends WorkoutSet {
  /** ISO timestamp of the parent workout (if known). */
  at?: string | null;
}

/** Aggregated summary for the PR / "next time" cards. */
export interface ExerciseBestSummary {
  /** Max Epley-1RM over the whole history (kg). `0` when no strength sets. */
  best1rm: number;
  /** Best set that produced `best1rm`. `null` when no strength data. */
  bestSet: ExerciseBestSet | null;
  /** Top set of the *most recent* workout — drives the "next time" hint. */
  lastTop: ExerciseBestSet | null;
  /**
   * `true` when the most recent workout's best 1RM strictly exceeds
   * every prior workout's best 1RM. Used to surface the "new PR" banner.
   */
  isNewPR: boolean;
}

/** Bucketed point on a weekly chart. */
export interface ExerciseTrendPoint {
  /** Numeric value for the Y axis (kg for 1RM, kg for volume). */
  value: number;
  /** Short uk-UA date label (e.g. `"15 кві"`) for the X axis. */
  dateLabel: string;
  /** ISO `YYYY-MM-DD` key of the bucket's Monday. Stable for tests. */
  weekKey: string;
}

/** Two aligned series for the strength trend card (max 12 weeks). */
export interface ExerciseStrengthTrend {
  rmPoints: ExerciseTrendPoint[];
  volPoints: ExerciseTrendPoint[];
}

/** Per-session cardio datapoint. */
export interface ExerciseCardioPoint {
  value: number;
  dateLabel: string;
}

/** Pace (min/km) and distance (km) series for the cardio trend cards. */
export interface ExerciseCardioTrend {
  pacePoints: ExerciseCardioPoint[];
  distPoints: ExerciseCardioPoint[];
}

/** A single load-calculator row ("Сила" / "Гіпертрофія" / "Витривалість"). */
export interface LoadCalculatorZone {
  /** Ukrainian label shown in the header row. */
  goal: string;
  /** Identifier for colour-palette lookups in UI layers. */
  tone: "strength" | "hypertrophy" | "endurance";
  /** Description copy ("85–95% від 1RM"). */
  desc: string;
  /** Entries sorted by descending percent. */
  entries: readonly LoadCalculatorEntry[];
}

/** Single percent → kg entry inside a zone. */
export interface LoadCalculatorEntry {
  percent: number;
  /** Weight rounded to the nearest 2.5 kg. `0` when `oneRM <= 0`. */
  kg: number;
}

/** Round a kilogram value to the nearest 2.5 kg bin (non-negative). */
export function roundToNearest2_5(kg: number): number {
  const n = toNum(kg);
  if (n <= 0) return 0;
  return Math.round(n / 2.5) * 2.5;
}

/**
 * Collect all `(workout, item)` pairs whose `item.exerciseId` matches
 * `exerciseId`, sorted by `workout.startedAt` **descending** (newest
 * first). Workouts without a parseable `startedAt` sink to the bottom
 * so a single malformed row never hides valid data.
 */
export function collectExerciseHistory(
  workouts: readonly Workout[] | null | undefined,
  exerciseId: string,
): ExerciseHistoryEntry[] {
  if (!exerciseId) return [];
  const out: ExerciseHistoryEntry[] = [];
  for (const w of workouts ?? []) {
    for (const it of w?.items ?? []) {
      if (!it || it.exerciseId !== exerciseId) continue;
      out.push({ workout: w, item: it });
    }
  }
  out.sort((a, b) => {
    const at = a.workout?.startedAt ? Date.parse(a.workout.startedAt) : NaN;
    const bt = b.workout?.startedAt ? Date.parse(b.workout.startedAt) : NaN;
    const aOk = Number.isFinite(at);
    const bOk = Number.isFinite(bt);
    if (!aOk && !bOk) return 0;
    if (!aOk) return 1;
    if (!bOk) return -1;
    return bt - at;
  });
  return out;
}

/**
 * Compute the personal-record / "last top set" / new-PR summary off a
 * history list produced by {@link collectExerciseHistory}. The function
 * is a pure fold — it does not look at the broader workouts list, so
 * callers control the scope (e.g. filtering to a date range).
 */
export function computeExerciseBest(
  history: readonly ExerciseHistoryEntry[],
): ExerciseBestSummary {
  let best1rm = 0;
  let bestSet: ExerciseBestSet | null = null;
  let lastTopSet: ExerciseBestSet | null = null;
  let lastTopEst = 0;
  let lastWorkoutBest1rm = 0;
  let priorBest1rm = 0;

  // Під strict-index `history[0]` має тип `T | undefined`, тому
  // явно проводимо через optional-chain — зберігаємо стару семантику
  // «`null` коли історія порожня».
  const lastWorkoutId =
    history.length > 0 ? (history[0]?.workout?.id ?? null) : null;

  for (const { workout, item } of history) {
    if (item?.type !== "strength") continue;
    const isLatest = workout?.id === lastWorkoutId;
    const sets = Array.isArray(item.sets) ? item.sets : [];
    for (const s of sets) {
      const est = epley1rm(s.weightKg, s.reps);
      if (est > best1rm) {
        best1rm = est;
        bestSet = {
          weightKg: toNum(s.weightKg),
          reps: toNum(s.reps),
          at: workout?.startedAt ?? null,
        };
      }
      if (isLatest) {
        if (est > lastWorkoutBest1rm) lastWorkoutBest1rm = est;
        if (est > lastTopEst) {
          lastTopEst = est;
          lastTopSet = {
            weightKg: toNum(s.weightKg),
            reps: toNum(s.reps),
            at: workout?.startedAt ?? null,
          };
        }
      } else if (est > priorBest1rm) {
        priorBest1rm = est;
      }
    }
  }

  const isNewPR = lastWorkoutBest1rm > 0 && lastWorkoutBest1rm > priorBest1rm;
  return { best1rm, bestSet, lastTop: lastTopSet, isNewPR };
}

/**
 * Start-of-Monday local-time timestamp for the given date (ms). Uses
 * the local tz, matching the web page's `getDay() - ((+6)%7)` trick.
 */
function mondayStartLocalMs(d: Date): number {
  const x = new Date(d);
  const offset = (x.getDay() + 6) % 7;
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - offset);
  return x.getTime();
}

function weekKeyFromMondayMs(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Group the strength history into Monday-starting weekly buckets and
 * return up to the **last 12** buckets as two aligned series:
 *  - `rmPoints.value` = round(max Epley-1RM in the week, kg);
 *  - `volPoints.value` = round(sum of `weightKg × reps`, kg).
 * Non-strength items and items without a parseable `startedAt` are skipped.
 */
export function computeExerciseWeeklyTrend(
  history: readonly ExerciseHistoryEntry[],
): ExerciseStrengthTrend {
  const byWeek = new Map<
    string,
    { maxRm: number; vol: number; weekStartMs: number }
  >();

  for (const { workout, item } of history) {
    if (item?.type !== "strength") continue;
    const iso = workout?.startedAt;
    if (!iso) continue;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) continue;
    const weekStart = mondayStartLocalMs(new Date(t));
    const key = weekKeyFromMondayMs(weekStart);
    const sets = Array.isArray(item.sets) ? item.sets : [];
    let maxRm = 0;
    let vol = 0;
    for (const s of sets) {
      const rm = epley1rm(s.weightKg, s.reps);
      if (rm > maxRm) maxRm = rm;
      vol += toNum(s.weightKg) * toNum(s.reps);
    }
    const prev = byWeek.get(key) ?? {
      maxRm: 0,
      vol: 0,
      weekStartMs: weekStart,
    };
    byWeek.set(key, {
      maxRm: Math.max(prev.maxRm, maxRm),
      vol: prev.vol + vol,
      weekStartMs: weekStart,
    });
  }

  const sorted = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-WEEK_BUCKET_CAP);

  const rmPoints: ExerciseTrendPoint[] = sorted.map(([key, v]) => ({
    value: Math.round(v.maxRm),
    dateLabel: formatUkDateShort(new Date(v.weekStartMs)),
    weekKey: key,
  }));
  const volPoints: ExerciseTrendPoint[] = sorted.map(([key, v]) => ({
    value: Math.round(v.vol),
    dateLabel: formatUkDateShort(new Date(v.weekStartMs)),
    weekKey: key,
  }));

  return { rmPoints, volPoints };
}

/**
 * Build the cardio trend — one point per distance-type session (oldest
 * first), capped at the last 12 sessions. Pace is min/km, distance km.
 * Sessions with no positive distance+duration pair are skipped.
 */
export function computeExerciseCardioTrend(
  history: readonly ExerciseHistoryEntry[],
): ExerciseCardioTrend {
  const pace: ExerciseCardioPoint[] = [];
  const dist: ExerciseCardioPoint[] = [];
  // History is newest-first; iterate in reverse to emit oldest-first.
  for (let i = history.length - 1; i >= 0; i -= 1) {
    // Під strict-index `history[i]` дає `T | undefined`; інваріант
    // циклу `0 ≤ i < history.length` гарантує визначеність, але
    // перевіряємо явно замість non-null assertion.
    const entry = history[i];
    if (!entry) continue;
    const { workout, item } = entry;
    if (item?.type !== "distance") continue;
    const iso = workout?.startedAt;
    if (!iso) continue;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) continue;
    const distM = toNum(item.distanceM);
    const durSec = toNum(item.durationSec);
    if (distM <= 0 || durSec <= 0) continue;
    const distKm = distM / 1000;
    const paceMinKm = durSec / 60 / distKm;
    const dateLabel = formatUkDateShort(new Date(t));
    pace.push({ value: Math.round(paceMinKm * 10) / 10, dateLabel });
    dist.push({ value: Math.round(distKm * 100) / 100, dateLabel });
  }
  return {
    pacePoints: pace.slice(-WEEK_BUCKET_CAP),
    distPoints: dist.slice(-WEEK_BUCKET_CAP),
  };
}

/** Canonical percent ladder used by the load-calculator card. */
const LOAD_CALCULATOR_ZONES: ReadonlyArray<{
  goal: string;
  tone: LoadCalculatorZone["tone"];
  desc: string;
  percents: readonly number[];
}> = [
  {
    goal: "Сила",
    tone: "strength",
    desc: "85–95% від 1RM",
    percents: [95, 90, 85],
  },
  {
    goal: "Гіпертрофія",
    tone: "hypertrophy",
    desc: "65–80% від 1RM",
    percents: [80, 75, 70, 65],
  },
  {
    goal: "Витривалість",
    tone: "endurance",
    desc: "50–65% від 1RM",
    percents: [65, 60, 55, 50],
  },
];

/**
 * Build the load-calculator rows for a given 1RM. Returns an empty
 * array when `oneRM <= 0` so UI callers can short-circuit the card.
 */
export function buildLoadCalculatorZones(oneRM: number): LoadCalculatorZone[] {
  const base = toNum(oneRM);
  if (base <= 0) return [];
  return LOAD_CALCULATOR_ZONES.map((z) => ({
    goal: z.goal,
    tone: z.tone,
    desc: z.desc,
    entries: z.percents.map((percent) => ({
      percent,
      kg: roundToNearest2_5(base * (percent / 100)),
    })),
  }));
}
