/**
 * Pure-доступ до вбудованого каталогу вправ Фізрука.
 *
 * Дані завантажуються як звичайний JSON, що дозволяє пакету лишатись
 * pure (без `fetch`/`dynamic import`/DOM-залежностей). Споживачі в
 * `apps/web` / `apps/mobile` можуть імпортувати готовий об'єкт або
 * окремі хелпери пошуку / lookup.
 */

import type { ExerciseDef } from "../domain/types.js";
// `resolveJsonModule: true` is set across every tsconfig that imports
// this module, so the redundant `with { type: "json" }` attribute is
// omitted — it would otherwise require `module: nodenext`/`esnext`
// which the mobile config (`moduleResolution: bundler`) does not opt
// into by default, and the import attribute proposal is a runtime-only
// hint that the bundled JSON emitters already honour.
import exercisesCatalog from "./exercises.gymup.json";
import { mapDomainMuscleToAtlas } from "./bodyAtlas.js";

export * from "./bodyAtlas.js";
export * from "./bodyAtlasGeometry.js";

/** JSON-каталог «як є» (з `labels` + `exercises`). */
export interface ExerciseCatalog {
  schemaVersion?: number;
  source?: { name?: string; notes?: string };
  labels?: {
    primaryGroupsUk?: Record<string, string>;
    equipmentUk?: Record<string, string>;
    musclesUk?: Record<string, string>;
    musclesByPrimaryGroup?: Record<string, string[]>;
  };
  exercises?: RawExerciseDef[];
  [key: string]: unknown;
}

/** Формат запису у вбудованому JSON каталозі. */
export interface RawExerciseDef {
  id: string;
  name: { uk: string; en?: string };
  primaryGroup: string;
  primaryGroupUk?: string;
  muscles?: { primary?: string[]; secondary?: string[] };
  equipment?: string[];
  aliases?: string[];
  description?: string;
  [key: string]: unknown;
}

/** Вбудований каталог вправ (read-only). */
export const EXERCISE_CATALOG: ExerciseCatalog =
  exercisesCatalog as ExerciseCatalog;

/** Нормалізований список вправ з каталогу. */
export const EXERCISES: RawExerciseDef[] = Array.isArray(
  EXERCISE_CATALOG.exercises,
)
  ? EXERCISE_CATALOG.exercises
  : [];

/** Мапа українських назв primary-груп. */
export const PRIMARY_GROUPS_UK: Record<string, string> =
  EXERCISE_CATALOG.labels?.primaryGroupsUk || {};

/** Мапа українських назв обладнання. */
export const EQUIPMENT_UK: Record<string, string> =
  EXERCISE_CATALOG.labels?.equipmentUk || {};

/** Мапа українських назв м'язів. */
export const MUSCLES_UK: Record<string, string> =
  EXERCISE_CATALOG.labels?.musclesUk || {};

/** Мапа м'язів по primary-групі (для BodyAtlas і recovery-обчислень). */
export const MUSCLES_BY_PRIMARY_GROUP: Record<string, string[]> =
  EXERCISE_CATALOG.labels?.musclesByPrimaryGroup || {};

function norm(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

/**
 * Пошук вправи за ID у вбудованому каталозі.
 * Повертає `null`, якщо вправу не знайдено.
 */
export function findExerciseById(id: string): RawExerciseDef | null {
  if (!id) return null;
  for (const ex of EXERCISES) {
    if (ex?.id === id) return ex;
  }
  return null;
}

/**
 * Повертає всі вправи, що належать заданій primary-групі.
 */
export function getExercisesByPrimaryGroup(
  primaryGroup: string,
): RawExerciseDef[] {
  if (!primaryGroup) return [];
  return EXERCISES.filter((ex) => ex?.primaryGroup === primaryGroup);
}

/**
 * Перетворює запис каталогу у форму `ExerciseDef` (плоскі масиви м'язів).
 */
export function toExerciseDef(
  ex: RawExerciseDef | null | undefined,
): ExerciseDef | null {
  if (!ex?.id) return null;
  return {
    id: ex.id,
    nameUk: ex.name?.uk || ex.id,
    primaryGroup: ex.primaryGroup,
    musclesPrimary: Array.isArray(ex.muscles?.primary)
      ? ex.muscles!.primary!
      : [],
    musclesSecondary: Array.isArray(ex.muscles?.secondary)
      ? ex.muscles!.secondary!
      : [],
    type: "strength",
  };
}

/**
 * Повнотекстовий пошук по локальному каталогу (uk/en назви, aliases,
 * description, primary group). Повертає всі вправи, якщо query порожній.
 */
export function searchExercises(
  query: string,
  pool: RawExerciseDef[] = EXERCISES,
): RawExerciseDef[] {
  const q = norm(query);
  if (!q) return pool.slice();
  return pool.filter((ex) => {
    const nameUk = norm(ex?.name?.uk);
    const nameEn = norm(ex?.name?.en);
    const aliases = (ex?.aliases || []).map(norm).join(" ");
    const desc = norm(ex?.description);
    const group = norm(ex?.primaryGroup);
    const groupUk = norm(ex?.primaryGroupUk);
    return (
      nameUk.includes(q) ||
      nameEn.includes(q) ||
      aliases.includes(q) ||
      desc.includes(q) ||
      group.includes(q) ||
      groupUk.includes(q)
    );
  });
}

/**
 * Злиття списку користувацьких вправ із вбудованим каталогом. Кастомні
 * ідуть першими (з позначкою `_custom`), дублікати по `id` відкидаються.
 */
export function mergeExerciseCatalog(
  custom: RawExerciseDef[],
  base: RawExerciseDef[] = EXERCISES,
): RawExerciseDef[] {
  const merged = [...(Array.isArray(custom) ? custom : []), ...base];
  const seen = new Set<string>();
  const out: RawExerciseDef[] = [];
  for (const ex of merged) {
    const id = ex?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(ex);
  }
  return out;
}

/**
 * Up to `limit` Ukrainian exercise names whose primary muscles map to the
 * given canonical atlas muscle id. Powers the selected-muscle card in the
 * BodyAtlas without the web layer re-deriving the muscle→exercise join.
 */
export function getExerciseNamesByAtlasMuscle(
  atlasMuscleId: string,
  limit = 5,
): string[] {
  if (!atlasMuscleId) return [];
  const out: string[] = [];
  for (const ex of EXERCISES) {
    const primary = ex?.muscles?.primary;
    if (!Array.isArray(primary)) continue;
    const hit = primary.some(
      (m) => mapDomainMuscleToAtlas(m) === atlasMuscleId,
    );
    if (!hit) continue;
    const name = ex?.name?.uk;
    if (name && !out.includes(name)) out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

export { exercisesCatalog };
