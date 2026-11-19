/**
 * Pure selectors over the persisted list of `Workout` entries.
 *
 * The mobile Workouts page uses these to build a newest-first journal
 * grouped by local calendar date, and to render per-row aggregate
 * summaries (item count, total sets, tonnage, duration). Keeping
 * them here lets vitest cover the reducer contract in isolation and
 * lets both platforms share the same counting rules.
 */

import { compareIsoDesc } from "../../lib/workoutStats.js";
import { isSetCompleted } from "./setCompletion.js";
import { itemHasVolume } from "./measureItem.js";
import type {
  Workout,
  WorkoutForJournal,
  WorkoutSummary,
  WorkoutSummaryInput,
} from "./types.js";

/**
 * Local-date bucket key for a workout in `YYYY-MM-DD` form. Returns
 * `null` when the workout has no parseable `startedAt` — callers
 * drop such rows into a trailing "Без дати" bucket if they want to.
 */
export function workoutDateKey(w: Pick<Workout, "startedAt">): string | null {
  if (!w?.startedAt) return null;
  const t = Date.parse(w.startedAt);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Newest-first comparator. Workouts without a parseable `startedAt`
 * sink to the bottom so a single malformed entry never hides valid
 * rows. Generic over `W extends WorkoutForJournal` so mobile shape
 * variants pass through without `as unknown as Workout` casts.
 */
export function compareWorkoutsByStartedAtDesc<W extends WorkoutForJournal>(
  a: W,
  b: W,
): number {
  return compareIsoDesc(a?.startedAt, b?.startedAt);
}

/** Newest-first sort. Does not mutate `workouts`. */
export function sortWorkoutsByStartedAtDesc<W extends WorkoutForJournal>(
  workouts: readonly W[],
): W[] {
  const arr = workouts.slice();
  arr.sort(compareWorkoutsByStartedAtDesc);
  return arr;
}

/**
 * Group workouts by their local calendar-date prefix. Preserves the
 * inbound ordering inside each bucket so callers can pre-sort once
 * and trust the result.
 */
export function groupWorkoutsByDate<W extends WorkoutForJournal>(
  workouts: readonly W[],
): Record<string, W[]> {
  const out: Record<string, W[]> = {};
  for (const w of workouts) {
    const key = workoutDateKey(w) ?? "";
    const bucket = out[key] ?? [];
    bucket.push(w);
    out[key] = bucket;
  }
  return out;
}

/**
 * Ordered (newest-first) list of `[dateKey, workouts[]]` buckets for
 * the journal `SectionList`. Empty-key ("Без дати") bucket, if any,
 * is appended last. Generic so the caller's wider workout type
 * survives the round-trip.
 */
export function buildWorkoutJournalSections<W extends WorkoutForJournal>(
  workouts: readonly W[],
): { dateKey: string; workouts: W[] }[] {
  const sorted = sortWorkoutsByStartedAtDesc(workouts);
  const byKey = groupWorkoutsByDate(sorted);
  const keys = Object.keys(byKey).filter((k) => k !== "");
  // Descending by key — since keys are `YYYY-MM-DD`, a lexicographic
  // reverse sort equals the chronological newest-first order.
  keys.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const sections = keys.map((k) => ({ dateKey: k, workouts: byKey[k]! }));
  if (byKey[""]) {
    sections.push({ dateKey: "", workouts: byKey[""]! });
  }
  return sections;
}

/**
 * Total barbell tonnage (kg × reps, strength items only). Non-finite
 * / negative entries contribute `0`.
 */
export function computeWorkoutTonnageKg(
  w: WorkoutSummaryInput | null | undefined,
): number {
  if (!w) return 0;
  let total = 0;
  for (const it of w.items || []) {
    // Обʼєм лише для вага × повтори (`itemHasVolume`, спека типу виміру).
    if (!it || !itemHasVolume(it)) continue;
    for (const s of it.sets || []) {
      const wg = Number(s?.weightKg);
      const r = Number(s?.reps);
      if (!Number.isFinite(wg) || !Number.isFinite(r)) continue;
      if (wg <= 0 || r <= 0) continue;
      total += wg * r;
    }
  }
  return total;
}

/**
 * Зараховані підходи всіх вправ (`isSetCompleted`, за типом виміру). Плитка
 * «Підходів», журнал, поріг повноцінного тренування.
 */
export function computeWorkoutSetCount(
  w: WorkoutSummaryInput | null | undefined,
): number {
  if (!w) return 0;
  let n = 0;
  for (const it of w.items || []) {
    // Підходи будь-якого типу виміру (спека типу виміру, Р-3 і Б-2 founder-а
    // 2026-11-18): на час і на дистанцію теж ідуть у поріг повноцінного.
    // Єдине визначення зарахованого підходу (`setCompletion.ts`): рядок
    // лише з вагою — не підхід; старі item-и часу й дистанції без підходів
    // нічого не дають.
    for (const s of it?.sets || []) {
      if (isSetCompleted(s, it)) n += 1;
    }
  }
  return n;
}

/**
 * Зроблені вправи для підсумку «Вправ N з M» (рішення founder-а 2026-11-18):
 * вправа з хоча б одним зарахованим підходом (`isSetCompleted`, той самий
 * предикат, що й `computeWorkoutSetCount`). Старий item часу чи дистанції
 * без рядків підходів зроблений, коли секунди чи метри записано на ньому
 * самому. Лише підпис підсумку: журнал, історія й метрики число не беруть.
 */
export function computeWorkoutDoneItemCount(
  w: WorkoutSummaryInput | null | undefined,
): number {
  if (!w) return 0;
  let n = 0;
  for (const it of w.items || []) {
    if (!it) continue;
    const counted = (it.sets || []).some((s) => isSetCompleted(s, it));
    const legacy =
      (it.sets?.length ?? 0) === 0 &&
      (Number(it.durationSec) > 0 || Number(it.distanceM) > 0);
    if (counted || legacy) n += 1;
  }
  return n;
}

/**
 * Duration in whole seconds between `startedAt` and `endedAt` (or
 * `null` if the workout is still in progress). Returns `0` when the
 * timestamps are malformed so UI formatters never emit `NaN`.
 */
export function computeWorkoutDurationSec(
  w: WorkoutSummaryInput | null | undefined,
): number | null {
  if (!w?.startedAt) return null;
  const start = Date.parse(w.startedAt);
  if (!Number.isFinite(start)) return null;
  if (!w.endedAt) return null;
  const end = Date.parse(w.endedAt);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / 1000));
}

/** Journal-row aggregate. Pure, cheap, safe on incomplete entries. */
export function computeWorkoutSummary(
  w: WorkoutSummaryInput | null | undefined,
): WorkoutSummary {
  return {
    itemCount: (w?.items || []).length,
    setCount: computeWorkoutSetCount(w),
    tonnageKg: computeWorkoutTonnageKg(w),
    durationSec: computeWorkoutDurationSec(w),
    isFinished: Boolean(w?.endedAt),
  };
}

/**
 * Human-readable local date label for a `YYYY-MM-DD` key. Falls back
 * to "Без дати" for the empty bucket.
 */
export function formatWorkoutDateLabel(
  dateKey: string,
  locale: string = "uk-UA",
): string {
  if (!dateKey) return "Без дати";
  const t = Date.parse(`${dateKey}T12:00:00`);
  if (!Number.isFinite(t)) return dateKey;
  return new Date(t).toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
