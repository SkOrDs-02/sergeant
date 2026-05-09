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
  type FizrukDailyLogSnapshot,
  type FizrukDualWriteState,
  type FizrukItemSnapshot,
  type FizrukMeasurementSnapshot,
  type FizrukMonthlyPlanSnapshot,
  type FizrukSetSnapshot,
  type FizrukWorkoutSnapshot,
  type FizrukWorkoutTemplateSnapshot,
} from "./dualWrite/diff.js";
import { getCachedFizrukSqliteState } from "./sqliteReader.js";

type RawExerciseDef = FizrukData.RawExerciseDef;

/**
 * Stage 12 — minimal hook-side shapes the extractors accept. They are
 * structurally compatible with the web hooks' types
 * (`apps/web/src/modules/fizruk/hooks/useDailyLog.ts`,
 * `useMonthlyPlan.ts`, `useWorkoutTemplates.ts`) but do not import
 * those files to keep this module hook-free.
 */
export interface FizrukDailyLogEntryLike {
  id?: string | null;
  at?: string | null;
  weightKg?: number | null;
  sleepHours?: number | null;
  energyLevel?: number | null;
  /** Web hook field. */
  moodScore?: number | null;
  /** Mobile / domain-shared field — used as a fallback. */
  mood?: number | null;
  note?: string | null;
}

export interface FizrukMonthlyPlanLike {
  reminderEnabled?: boolean;
  reminderHour?: number;
  reminderMinute?: number;
  days?: Record<string, { templateId?: string }>;
}

export interface FizrukWorkoutTemplateLike {
  id?: string | null;
  name?: string | null;
  exerciseIds?: readonly unknown[];
  groups?: readonly unknown[];
  updatedAt?: string | null;
  lastUsedAt?: string | null;
}

export const EMPTY_FIZRUK_DUAL_WRITE_STATE: FizrukDualWriteState = {
  workouts: [],
  customExercises: [],
  measurements: [],
  dailyLog: [],
  monthlyPlan: null,
  workoutTemplates: [],
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
      dailyLog: extractDailyLogSnapshots(cache.dailyLog ?? []),
      monthlyPlan: extractMonthlyPlanSnapshot(cache.monthlyPlan ?? null),
      workoutTemplates: extractWorkoutTemplateSnapshots(
        cache.workoutTemplates ?? [],
      ),
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
// Stage 12 / PR #070f-dualwrite — daily-log / monthly-plan / templates
// -----------------------------------------------------------------------

/**
 * Extract daily-log snapshots from a hook-side array. The web hook
 * uses `moodScore` while the domain / mobile shape uses `mood` — we
 * coalesce both into the single `mood` integer column the
 * `fizruk_daily_log` schema exposes.
 */
export function extractDailyLogSnapshots(
  entries: readonly FizrukDailyLogEntryLike[],
): FizrukDailyLogSnapshot[] {
  const out: FizrukDailyLogSnapshot[] = [];
  for (const e of entries) {
    if (!e || typeof e !== "object" || !e.id || !e.at) continue;
    out.push({
      id: String(e.id),
      at: String(e.at),
      weightKg: numericOrNull(e.weightKg),
      sleepHours: numericOrNull(e.sleepHours),
      energyLevel: numericOrNull(e.energyLevel),
      // Coalesce moodScore (web) ↔ mood (domain).
      mood: numericOrNull(e.moodScore ?? e.mood ?? null),
      note: typeof e.note === "string" ? e.note : "",
    });
  }
  return out;
}

/**
 * Serialize the singleton monthly-plan document into the snapshot
 * shape — the diff layer only needs the JSON string for byte-equal
 * change detection. Returns `null` when the input is `null`.
 */
export function extractMonthlyPlanSnapshot(
  state: FizrukMonthlyPlanLike | null | undefined,
): FizrukMonthlyPlanSnapshot | null {
  if (!state || typeof state !== "object") return null;
  const safe = {
    reminderEnabled: state.reminderEnabled !== false,
    reminderHour: Number.isFinite(state.reminderHour)
      ? Math.max(0, Math.min(23, state.reminderHour ?? 18))
      : 18,
    reminderMinute: Number.isFinite(state.reminderMinute)
      ? Math.max(0, Math.min(59, state.reminderMinute ?? 0))
      : 0,
    days:
      state.days && typeof state.days === "object"
        ? Object.fromEntries(
            Object.entries(state.days)
              .filter(
                ([k, v]) =>
                  typeof k === "string" &&
                  v != null &&
                  typeof v === "object" &&
                  typeof (v as { templateId?: unknown }).templateId ===
                    "string",
              )
              .map(([k, v]) => [
                k,
                {
                  templateId: String((v as { templateId: string }).templateId),
                },
              ]),
          )
        : {},
  };
  return { dataJson: JSON.stringify(safe) };
}

/**
 * Extract workout-template snapshots from a hook-side array. Falls
 * back to the entry's own `at`/created timestamp when `updatedAt` is
 * missing so the LWW guard always has a non-empty value.
 */
export function extractWorkoutTemplateSnapshots(
  templates: readonly FizrukWorkoutTemplateLike[],
): FizrukWorkoutTemplateSnapshot[] {
  const out: FizrukWorkoutTemplateSnapshot[] = [];
  for (const t of templates) {
    if (!t || typeof t !== "object" || !t.id) continue;
    const exerciseIds = Array.isArray(t.exerciseIds)
      ? t.exerciseIds.filter((id): id is string => typeof id === "string")
      : [];
    const groups = Array.isArray(t.groups) ? [...t.groups] : [];
    out.push({
      id: String(t.id),
      name: typeof t.name === "string" ? t.name : "",
      exerciseIds,
      groups,
      updatedAt: typeof t.updatedAt === "string" ? t.updatedAt : "",
      lastUsedAt: typeof t.lastUsedAt === "string" ? t.lastUsedAt : null,
    });
  }
  return out;
}

function numericOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
