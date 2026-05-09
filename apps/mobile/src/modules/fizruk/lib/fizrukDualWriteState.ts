/**
 * Snapshot extraction + cache peek helpers for the mobile Fizruk
 * dual-write pipeline.
 *
 * Stage 8 PR #057f-tombstone of `docs/planning/storage-roadmap.md`
 * (mobile parity for `apps/web/src/modules/fizruk/lib/fizrukDualWriteState.ts`).
 *
 * `peekFizrukDualWriteState()` returns `null` when no dual-write
 * context is registered — the write call sites use this as a
 * fast-path gate so we never enqueue SQLite ops pre-auth.
 */

import type { FizrukData, WorkoutWellbeing } from "@sergeant/fizruk-domain";

/**
 * Loose structural type accepted by `extractWorkoutSnapshots`. Both
 * the strict domain `Workout` and the wider mobile `FizrukWorkout`
 * (with `items` carrying optional fields + index signature) satisfy
 * this shape, so the snapshot extractor can be called from either
 * the cache path (domain `Workout[]`) or the hook path (mobile
 * `FizrukWorkout[]`) without unsafe `as unknown as` double-casts.
 */
export type ExtractableWorkoutLike = {
  readonly id: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly items: readonly ExtractableWorkoutItemLike[];
  readonly groups: readonly {
    readonly id: string;
    readonly itemIds: readonly string[];
  }[];
  readonly warmup: readonly ExtractableChecklistLike[] | null;
  readonly cooldown: readonly ExtractableChecklistLike[] | null;
  readonly note?: string;
  readonly wellbeing?: WorkoutWellbeing | null;
};

export type ExtractableWorkoutItemLike = {
  readonly id: string;
  readonly exerciseId?: string;
  readonly nameUk?: string;
  readonly primaryGroup?: string;
  readonly musclesPrimary?: readonly string[];
  readonly musclesSecondary?: readonly string[];
  readonly type?: string;
  readonly sets?: readonly {
    weightKg: number;
    reps: number;
    rpe?: number | null;
  }[];
  readonly durationSec?: number;
  readonly distanceM?: number;
  readonly [extra: string]: unknown;
};

export type ExtractableChecklistLike = {
  readonly id: string;
  readonly done: boolean;
  readonly label: string;
};

import { isFizrukDualWriteRegistered } from "./dualWrite/index";
import {
  type FizrukCustomExerciseSnapshot,
  type FizrukDualWriteState,
  type FizrukItemSnapshot,
  type FizrukMeasurementSnapshot,
  type FizrukSetSnapshot,
  type FizrukWorkoutSnapshot,
} from "./dualWrite/diff";
import { getCachedFizrukSqliteState } from "./sqliteReader";

type RawExerciseDef = FizrukData.RawExerciseDef;

export const EMPTY_FIZRUK_DUAL_WRITE_STATE: FizrukDualWriteState = {
  workouts: [],
  customExercises: [],
  measurements: [],
};

/**
 * Read the current SQLite-backed state. Returns `null` when no
 * dual-write context is registered (pre-auth or before the boot
 * wires the context — see `useFizrukDualWriteBoot`).
 */
export function peekFizrukDualWriteState(): FizrukDualWriteState | null {
  if (!isFizrukDualWriteRegistered()) return null;
  try {
    const cache = getCachedFizrukSqliteState();
    return {
      workouts: extractWorkoutSnapshots(cache.workouts),
      customExercises: extractCustomExerciseSnapshots(cache.customExercises),
      measurements: extractMeasurementSnapshots(cache.measurements),
    };
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------
// Snapshot extractors — translate domain objects into the loose
// snapshot shape the dual-write diff consumes.
// -----------------------------------------------------------------------

export function extractWorkoutSnapshots(
  workouts: readonly ExtractableWorkoutLike[],
): FizrukWorkoutSnapshot[] {
  const out: FizrukWorkoutSnapshot[] = [];
  for (const w of workouts) {
    if (!w || typeof w !== "object" || !w.id) continue;
    out.push(toWorkoutSnapshot(w));
  }
  return out;
}

export function extractCustomExerciseSnapshots(
  customExercises: readonly RawExerciseDef[],
): FizrukCustomExerciseSnapshot[] {
  const out: FizrukCustomExerciseSnapshot[] = [];
  for (const e of customExercises) {
    if (!e || typeof e !== "object" || !e.id) continue;
    out.push({ ...e, id: String(e.id) });
  }
  return out;
}

/**
 * Loose structural type accepted by `extractMeasurementSnapshots`.
 * Only `id` + `at` are required so both the mobile
 * `MobileMeasurementEntry` (closed shape) and the web
 * `MeasurementEntry` (open index signature) flow in without
 * unsafe `as unknown as` double-casts. The extractor reads
 * additional properties via `Object.entries` at runtime.
 */
export type ExtractableMeasurementLike = {
  readonly id: string;
  readonly at: string;
};

export function extractMeasurementSnapshots(
  entries: readonly ExtractableMeasurementLike[],
): FizrukMeasurementSnapshot[] {
  const out: FizrukMeasurementSnapshot[] = [];
  for (const m of entries) {
    if (!m || typeof m !== "object" || !m.id || !m.at) continue;
    out.push({ ...m, id: String(m.id), at: String(m.at) });
  }
  return out;
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function toWorkoutSnapshot(
  workout: ExtractableWorkoutLike,
): FizrukWorkoutSnapshot {
  return {
    id: String(workout.id),
    startedAt: String(workout.startedAt ?? ""),
    endedAt: workout.endedAt ?? null,
    items: (workout.items ?? []).map(toItemSnapshot),
    groups: (workout.groups ?? []).map(toGroupSnapshot),
    warmup: workout.warmup ? workout.warmup.map(toChecklistSnapshot) : null,
    cooldown: workout.cooldown
      ? workout.cooldown.map(toChecklistSnapshot)
      : null,
    note: typeof workout.note === "string" ? workout.note : "",
    wellbeing: workout.wellbeing
      ? toWellbeingSnapshot(workout.wellbeing)
      : null,
  };
}

function toItemSnapshot(item: ExtractableWorkoutItemLike): FizrukItemSnapshot {
  const out: {
    id: string;
    exerciseId: string;
    nameUk: string;
    primaryGroup: string;
    musclesPrimary: string[];
    musclesSecondary: string[];
    type: string;
    sets?: FizrukSetSnapshot[];
    durationSec?: number;
    distanceM?: number;
  } = {
    id: String(item.id),
    exerciseId: String(item.exerciseId ?? ""),
    nameUk: String(item.nameUk ?? ""),
    primaryGroup: String(item.primaryGroup ?? ""),
    musclesPrimary: Array.isArray(item.musclesPrimary)
      ? item.musclesPrimary.map(String)
      : [],
    musclesSecondary: Array.isArray(item.musclesSecondary)
      ? item.musclesSecondary.map(String)
      : [],
    type: String(item.type ?? "strength"),
  };
  if (Array.isArray(item.sets)) {
    out.sets = item.sets.map(
      (s): FizrukSetSnapshot => ({
        weightKg: typeof s.weightKg === "number" ? s.weightKg : 0,
        reps: typeof s.reps === "number" ? s.reps : 0,
        ...(typeof s.rpe === "number" ? { rpe: s.rpe } : {}),
      }),
    );
  }
  if (typeof item.durationSec === "number") out.durationSec = item.durationSec;
  if (typeof item.distanceM === "number") out.distanceM = item.distanceM;
  return out as FizrukItemSnapshot;
}

function toGroupSnapshot(group: {
  readonly id: string;
  readonly itemIds: readonly string[];
}): { id: string; itemIds: string[] } {
  return {
    id: String(group.id),
    itemIds: Array.isArray(group.itemIds) ? group.itemIds.map(String) : [],
  };
}

function toChecklistSnapshot(item: ExtractableChecklistLike): {
  id: string;
  done: boolean;
  label: string;
} {
  return {
    id: String(item.id),
    done: Boolean(item.done),
    label: String(item.label ?? ""),
  };
}

function toWellbeingSnapshot(w: WorkoutWellbeing): {
  energy?: number | null;
  mood?: number | null;
} {
  const out: { energy?: number | null; mood?: number | null } = {};
  if (w.energy !== undefined) out.energy = w.energy;
  if (w.mood !== undefined) out.mood = w.mood;
  return out;
}
