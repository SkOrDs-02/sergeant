/**
 * Workout-shape diff for the Fizruk dual-write layer (Stage 4 baseline).
 *
 * Mirrors the SQLite `fizruk_workouts` row shape. Scalar fields are
 * compared with `===`; nested structures (`items`, `groups`, `warmup`,
 * `cooldown`, `wellbeing`) are compared STRUCTURALLY, because
 * `toWorkoutSnapshot` rebuilds fresh arrays/objects on every persist: a
 * reference comparison made every history workout look changed and
 * re-uploaded the whole history on each edit (audit 2026-10-01, rel-09).
 */

import { diffArray } from "./diffArray";

export interface FizrukSetSnapshot {
  readonly weightKg: number;
  readonly reps: number;
  readonly rpe?: number | null;
  readonly [extra: string]: unknown;
}

export interface FizrukItemSnapshot {
  readonly id: string;
  readonly exerciseId: string;
  readonly nameUk: string;
  readonly primaryGroup: string;
  readonly musclesPrimary: string[];
  readonly musclesSecondary: string[];
  readonly type: string;
  readonly sets?: FizrukSetSnapshot[];
  readonly durationSec?: number;
  readonly distanceM?: number;
  readonly [extra: string]: unknown;
}

export interface FizrukWorkoutSnapshot {
  readonly id: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly items: FizrukItemSnapshot[];
  readonly groups: {
    id: string;
    itemIds: string[];
    type?: "circuit" | "superset";
    restSec?: number;
  }[];
  readonly warmup: { id: string; done: boolean; label: string }[] | null;
  readonly cooldown: { id: string; done: boolean; label: string }[] | null;
  readonly note: string;
  readonly wellbeing?: {
    energy?: number | null;
    mood?: number | null;
    [k: string]: unknown;
  } | null;
  /** Оцінка витрат, ккал. `null` - оцінювати нічим (немає ваги). */
  readonly kcalBurned?: number | null;
  readonly [extra: string]: unknown;
}

export interface WorkoutUpsertOp {
  readonly kind: "workout-upsert";
  readonly workout: FizrukWorkoutSnapshot;
}

export interface WorkoutDeleteOp {
  readonly kind: "workout-delete";
  readonly workoutId: string;
}

export type WorkoutOp = WorkoutUpsertOp | WorkoutDeleteOp;

export function diffWorkoutsOps(
  prev: readonly FizrukWorkoutSnapshot[],
  next: readonly FizrukWorkoutSnapshot[],
): WorkoutOp[] {
  const ops: WorkoutOp[] = [];
  diffArray(
    prev,
    next,
    (w) => w.id,
    workoutChanged,
    (w) => ops.push({ kind: "workout-upsert", workout: w }),
    (id) => ops.push({ kind: "workout-delete", workoutId: id }),
  );
  return ops;
}

function workoutChanged(
  prev: FizrukWorkoutSnapshot,
  next: FizrukWorkoutSnapshot,
): boolean {
  return (
    prev.startedAt !== next.startedAt ||
    prev.endedAt !== next.endedAt ||
    prev.note !== next.note ||
    // `?? null`: відсутній kcalBurned і `null` - те саме «оцінювати нічим».
    (prev.kcalBurned ?? null) !== (next.kcalBurned ?? null) ||
    !snapshotValueEqual(prev.items, next.items) ||
    !snapshotValueEqual(prev.groups, next.groups) ||
    !snapshotValueEqual(prev.warmup, next.warmup) ||
    !snapshotValueEqual(prev.cooldown, next.cooldown) ||
    !snapshotValueEqual(prev.wellbeing, next.wellbeing)
  );
}

/**
 * Рекурсивне порівняння plain-даних снапшота (масиви, обʼєкти, примітиви).
 * Порядок елементів масиву значущий (це порядок підходів/вправ), порядок
 * ключів обʼєкта - ні. Ключ зі значенням `undefined` дорівнює відсутньому
 * ключу: при серіалізації в рядок SQLite вони однакові. `NaN` дорівнює `NaN`,
 * інакше таке поле давало б фантомний upsert на кожен цикл запису.
 */
function snapshotValueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") {
    return Number.isNaN(a) && Number.isNaN(b);
  }
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    return false;
  }
  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;
  if (aIsArray) {
    const arrA = a as readonly unknown[];
    const arrB = b as readonly unknown[];
    if (arrA.length !== arrB.length) return false;
    for (let i = 0; i < arrA.length; i++) {
      if (!snapshotValueEqual(arrA[i], arrB[i])) return false;
    }
    return true;
  }
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  for (const key of Object.keys(objA)) {
    if (!snapshotValueEqual(objA[key], objB[key])) return false;
  }
  for (const key of Object.keys(objB)) {
    // Ключі, що є лише в `b`: різниця, якщо значення не `undefined`.
    if (!(key in objA) && objB[key] !== undefined) return false;
  }
  return true;
}
