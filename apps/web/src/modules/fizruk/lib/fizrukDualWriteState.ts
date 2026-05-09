/**
 * Snapshot extraction + cache peek helpers for the Fizruk dual-write
 * pipeline.
 *
 * Stage 8 PR #057f-tombstone of `docs/planning/storage-roadmap.md`.
 * The hooks (`useWorkouts`, `useExerciseCatalog`, `useMeasurements`)
 * and the residual-import boot helper share these helpers so the
 * dual-write payloads are computed in exactly one place.
 *
 * `peekFizrukDualWriteState()` returns `null` when no dual-write
 * context is registered — the write call sites use this as a fast-path
 * gate so we never enqueue SQLite ops pre-auth.
 *
 * Mirror of `apps/web/src/modules/nutrition/lib/nutritionStorage.ts`
 * `peekNutritionDualWriteState` (Stage 8 PR #057n-tombstone).
 */

import type {
  Workout,
  WorkoutItem,
  WorkoutGroup,
  ChecklistItem,
  WorkoutWellbeing,
  MeasurementEntry,
  FizrukData,
} from "@sergeant/fizruk-domain";

import { isFizrukDualWriteRegistered } from "./dualWrite/index.js";
import {
  type FizrukCustomExerciseSnapshot,
  type FizrukDualWriteState,
  type FizrukItemSnapshot,
  type FizrukMeasurementSnapshot,
  type FizrukSetSnapshot,
  type FizrukWorkoutSnapshot,
} from "./dualWrite/diff.js";
import { getCachedFizrukSqliteState } from "./sqliteReader.js";

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
// Snapshot extractors — translate domain objects (used in React state /
// LS payloads) into the loose snapshot shape the dual-write diff
// consumes.
// -----------------------------------------------------------------------

export function extractWorkoutSnapshots(
  workouts: readonly Workout[],
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

export function extractMeasurementSnapshots(
  entries: readonly MeasurementEntry[],
): FizrukMeasurementSnapshot[] {
  const out: FizrukMeasurementSnapshot[] = [];
  for (const m of entries) {
    if (!m || typeof m !== "object" || !m.id || !m.at) continue;
    // The `fizruk_measurements` SQLite table only has a single
    // `bicep_cm` column; the web hook splits it into `bicepLCm` /
    // `bicepRCm`. Coalesce here so the dual-write adapter (which
    // reads `m.bicepCm`) sees a value when the form set L/R only.
    const snap: Record<string, string | number | undefined> = { ...m };
    if (snap.bicepCm === undefined) {
      const left =
        typeof snap.bicepLCm === "number" ? snap.bicepLCm : undefined;
      const right =
        typeof snap.bicepRCm === "number" ? snap.bicepRCm : undefined;
      const fallback = left ?? right;
      if (fallback !== undefined) snap.bicepCm = fallback;
    }
    out.push({ ...snap, id: String(m.id), at: String(m.at) });
  }
  return out;
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function toWorkoutSnapshot(workout: Workout): FizrukWorkoutSnapshot {
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

function toItemSnapshot(item: WorkoutItem): FizrukItemSnapshot {
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

function toGroupSnapshot(group: WorkoutGroup): {
  id: string;
  itemIds: string[];
} {
  return {
    id: String(group.id),
    itemIds: Array.isArray(group.itemIds) ? group.itemIds.map(String) : [],
  };
}

function toChecklistSnapshot(item: ChecklistItem): {
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
