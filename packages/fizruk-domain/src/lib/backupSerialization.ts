/**
 * Pure parsing/serialization для персистованих структур Фізрука
 * (workouts + custom exercises). Жодних DOM-залежностей — працює з
 * сирими рядками / JS-обʼєктами. Web-only обгортка над localStorage
 * живе в `apps/web/src/modules/fizruk/lib/fizrukStorage.ts`.
 */

import { WORKOUTS_SCHEMA_VERSION, CUSTOM_SCHEMA_VERSION } from "../constants";

/** Legacy: plain JSON array. Current: `{ schemaVersion, workouts }`. */
export function parseWorkoutsFromStorage(
  raw: string | null | undefined,
): unknown[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p;
    if (p && Array.isArray(p.workouts)) return p.workouts;
  } catch {
    /* повертаємо [] на битий JSON */
  }
  return [];
}

export function serializeWorkoutsToStorage(workouts: unknown): string {
  return JSON.stringify({
    schemaVersion: WORKOUTS_SCHEMA_VERSION,
    workouts: Array.isArray(workouts) ? workouts : [],
  });
}

/** Legacy: JSON array. Current: `{ schemaVersion, exercises }`. */
export function parseCustomExercisesFromStorage(
  raw: string | null | undefined,
): unknown[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p;
    if (p && Array.isArray(p.exercises)) return p.exercises;
  } catch {
    /* повертаємо [] на битий JSON */
  }
  return [];
}

export function serializeCustomExercisesToStorage(exercises: unknown): string {
  return JSON.stringify({
    schemaVersion: CUSTOM_SCHEMA_VERSION,
    exercises: Array.isArray(exercises) ? exercises : [],
  });
}

type Identifiable = { id?: string; startedAt?: string; [key: string]: unknown };

function asIdentifiable(x: unknown): Identifiable | null {
  return x && typeof x === "object" ? (x as Identifiable) : null;
}

export function mergeWorkoutsById(
  a: readonly unknown[] | null | undefined,
  b: readonly unknown[] | null | undefined,
): Identifiable[] {
  const byId = new Map<string, Identifiable>();
  for (const raw of a || []) {
    const x = asIdentifiable(raw);
    if (x?.id) byId.set(x.id, x);
  }
  for (const raw of b || []) {
    const x = asIdentifiable(raw);
    if (x?.id) byId.set(x.id, x);
  }
  return [...byId.values()].sort((x, y) =>
    (y.startedAt || "").localeCompare(x.startedAt || ""),
  );
}

export function mergeCustomById(
  a: readonly unknown[] | null | undefined,
  b: readonly unknown[] | null | undefined,
): Identifiable[] {
  const byId = new Map<string, Identifiable>();
  for (const raw of a || []) {
    const x = asIdentifiable(raw);
    if (x?.id) byId.set(x.id, x);
  }
  for (const raw of b || []) {
    const x = asIdentifiable(raw);
    if (x?.id) byId.set(x.id, x);
  }
  return [...byId.values()];
}
