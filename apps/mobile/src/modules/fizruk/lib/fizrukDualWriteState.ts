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
  type FizrukDailyLogSnapshot,
  type FizrukDualWriteState,
  type FizrukItemSnapshot,
  type FizrukMeasurementSnapshot,
  type FizrukMonthlyPlanSnapshot,
  type FizrukPlanTemplateSnapshot,
  type FizrukProgramsSnapshot,
  type FizrukSetSnapshot,
  type FizrukWellbeingSnapshot,
  type FizrukWorkoutSnapshot,
  type FizrukWorkoutTemplateSnapshot,
} from "./dualWrite/diff";
import { getCachedFizrukSqliteState } from "./sqliteReader";

type RawExerciseDef = FizrukData.RawExerciseDef;

/**
 * Stage 12 / PR #070f-mobile-dualwrite — hook-side shapes the
 * extractors accept. Structurally compatible with the mobile hooks
 * (`useDailyLog`, `useMonthlyPlan`, `useWorkoutTemplates`) but kept
 * loose so the extractor module stays hook-free.
 */
export interface FizrukDailyLogEntryLike {
  id?: string | null;
  at?: string | null;
  weightKg?: number | null;
  sleepHours?: number | null;
  energyLevel?: number | null;
  /** Mobile / domain-shared field. */
  mood?: number | null;
  /** Web hook field — accepted as a fallback for forward-compat. */
  moodScore?: number | null;
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

/**
 * Stage 12.5 / PR #070f2-mobile-dualwrite — hook-side shapes for the
 * three remaining mobile-only Fizruk hooks. Kept loose so the
 * extractor module stays hook-free.
 */
export interface FizrukProgramsLike {
  /** Domain `ActiveProgramState.activeProgramId`. */
  activeProgramId?: string | null;
}

/** Mirror of `usePlanTemplate` `PlanTemplate` (allow extra fields). */
export interface FizrukPlanTemplateLike {
  id?: string | null;
  name?: string | null;
  weekday?: Record<string, string | null>;
  notes?: string | null;
  updatedAt?: string | null;
  [extra: string]: unknown;
}

export interface FizrukWellbeingEntryLike {
  /** `YYYY-MM-DD` — primary key. Required (filtered out otherwise). */
  date?: string | null;
  mood?: number | null;
  energy?: number | null;
  sleepQuality?: number | null;
  sleepHours?: number | null;
  notes?: string | null;
  updatedAt?: string | null;
}

export const EMPTY_FIZRUK_DUAL_WRITE_STATE: FizrukDualWriteState = {
  workouts: [],
  customExercises: [],
  measurements: [],
  dailyLog: [],
  monthlyPlan: null,
  workoutTemplates: [],
  programs: null,
  planTemplate: null,
  wellbeing: [],
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
      programs: extractProgramsSnapshotFromCache(cache.programs ?? null),
      planTemplate: extractPlanTemplateSnapshotFromCache(
        cache.planTemplate ?? null,
      ),
      wellbeing: extractWellbeingSnapshots(cache.wellbeing ?? []),
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

/**
 * Stage 12 / PR #070f-mobile-dualwrite — daily-log extractor. Mobile
 * `DailyLogEntry` carries `mood` directly; the `moodScore` fallback
 * is kept for forward-compat with the web hook shape.
 */
export function extractDailyLogSnapshots(
  entries: readonly FizrukDailyLogEntryLike[],
): FizrukDailyLogSnapshot[] {
  const out: FizrukDailyLogSnapshot[] = [];
  if (!Array.isArray(entries)) return out;
  for (const e of entries) {
    if (!e || typeof e !== "object" || !e.id || !e.at) continue;
    out.push({
      id: String(e.id),
      at: String(e.at),
      weightKg: numericOrNull(e.weightKg),
      sleepHours: numericOrNull(e.sleepHours),
      energyLevel: numericOrNull(e.energyLevel),
      mood: numericOrNull(e.mood ?? e.moodScore ?? null),
      note: typeof e.note === "string" ? e.note : "",
    });
  }
  return out;
}

/**
 * Stage 12 / PR #070f-mobile-dualwrite — monthly-plan singleton
 * extractor. Serializes the document to a stable JSON blob so the
 * diff layer can compare two payloads byte-for-byte and the
 * `fizruk_monthly_plan.data_json` column receives the exact same
 * string the web copy emits.
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
 * Stage 12 / PR #070f-mobile-dualwrite — workout-template extractor.
 * Mirrors the web copy: filters non-string `exerciseIds`, copies
 * `groups` verbatim, normalises `updatedAt` / `lastUsedAt`.
 */
export function extractWorkoutTemplateSnapshots(
  templates: readonly FizrukWorkoutTemplateLike[],
): FizrukWorkoutTemplateSnapshot[] {
  const out: FizrukWorkoutTemplateSnapshot[] = [];
  if (!Array.isArray(templates)) return out;
  for (const t of templates) {
    if (!t || typeof t !== "object" || !t.id) continue;
    const exerciseIds: string[] = Array.isArray(t.exerciseIds)
      ? (t.exerciseIds as readonly unknown[]).filter(
          (id: unknown): id is string => typeof id === "string",
        )
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

function integerOrNull(v: unknown): number | null {
  const n = numericOrNull(v);
  return n === null ? null : Math.round(n);
}

// -----------------------------------------------------------------------
// Stage 12.5 / PR #070f2-mobile-dualwrite — extractors
// -----------------------------------------------------------------------

/**
 * Extract a programs snapshot from a hook-shape `ActiveProgramState`
 * (or any structurally compatible payload). Returns `null` only for
 * cold cache (`state == null`); a present-but-empty active slot is
 * encoded as `{ activeProgramId: null }`.
 */
export function extractProgramsSnapshot(
  state: FizrukProgramsLike | null | undefined,
): FizrukProgramsSnapshot | null {
  if (state === null || state === undefined) return null;
  if (typeof state !== "object") return null;
  const id = state.activeProgramId;
  return {
    activeProgramId: typeof id === "string" && id.length > 0 ? id : null,
  };
}

/**
 * Extract a programs snapshot from the cached SQLite row. Mirrors
 * `extractProgramsSnapshot` but accepts the cache shape directly so
 * the cache peek path skips redundant transformations.
 */
function extractProgramsSnapshotFromCache(
  cached: { activeProgramId: string | null } | null,
): FizrukProgramsSnapshot | null {
  if (cached === null) return null;
  return { activeProgramId: cached.activeProgramId };
}

/**
 * Extract a plan-template snapshot. Mirrors the monthly-plan extractor:
 * the whole document is serialised to a stable JSON string. The empty
 * slot (`null`) is encoded as the JSON literal `'null'` so the SQLite
 * row stays present (and the LWW timestamp valid).
 */
export function extractPlanTemplateSnapshot(
  state: FizrukPlanTemplateLike | null | undefined,
): FizrukPlanTemplateSnapshot {
  if (state === null || state === undefined) {
    return { dataJson: "null" };
  }
  if (typeof state !== "object") return { dataJson: "null" };
  // Trust the hook to keep the document plain-object-serialisable.
  // `JSON.stringify` of a non-cyclic plain object never throws; if
  // it does (custom toJSON), fall back to `null` so the row stays
  // valid.
  try {
    return { dataJson: JSON.stringify(state) };
  } catch {
    return { dataJson: "null" };
  }
}

function extractPlanTemplateSnapshotFromCache(
  cached: { dataJson: string } | null,
): FizrukPlanTemplateSnapshot | null {
  if (cached === null) return null;
  return { dataJson: cached.dataJson };
}

/**
 * Extract wellbeing snapshots. Filters out entries with no `date`
 * key (the SQLite primary key is `(user_id, date_key)` so the row
 * is meaningless without a date).
 */
export function extractWellbeingSnapshots(
  entries: readonly FizrukWellbeingEntryLike[],
): FizrukWellbeingSnapshot[] {
  const out: FizrukWellbeingSnapshot[] = [];
  if (!Array.isArray(entries)) return out;
  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    const date = typeof e.date === "string" ? e.date : null;
    if (!date) continue;
    out.push({
      dateKey: date,
      mood: integerOrNull(e.mood ?? null),
      energy: integerOrNull(e.energy ?? null),
      sleepQuality: integerOrNull(e.sleepQuality ?? null),
      sleepHours: numericOrNull(e.sleepHours ?? null),
      notes: typeof e.notes === "string" ? e.notes : "",
      updatedAt: typeof e.updatedAt === "string" ? e.updatedAt : "",
    });
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
