/**
 * Pure-доступ до вбудованого каталогу вправ Фізрука.
 *
 * Дані завантажуються як звичайний JSON, що дозволяє пакету лишатись
 * pure (без `fetch`/`dynamic import`/DOM-залежностей). Споживачі в
 * `apps/web` / `apps/mobile` можуть імпортувати готовий обʼєкт або
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
export * from "./injurySites.js";
export * from "./exerciseInjuryZones.js";
export * from "./exerciseImages.js";

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

/** Мапа українських назв мʼязів. */
export const MUSCLES_UK: Record<string, string> =
  EXERCISE_CATALOG.labels?.musclesUk || {};

/** Мапа мʼязів по primary-групі (для BodyAtlas і recovery-обчислень). */
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
 * Перетворює запис каталогу у форму `ExerciseDef` (плоскі масиви мʼязів).
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

/** Structural shape needed by {@link matchesExerciseSearch} — satisfied by
 *  both `RawExerciseDef` and the mobile-side `WorkoutExerciseCatalogEntry`. */
export interface SearchableExerciseDef {
  name?: { uk?: string; en?: string };
  aliases?: string[];
  description?: string;
  primaryGroup?: string;
  primaryGroupUk?: string;
}

/**
 * Full-text match across uk/en names, aliases, description and primary
 * group. `query` must already be normalized (see `norm`).
 */
export function matchesExerciseSearch(
  ex: SearchableExerciseDef | null | undefined,
  normalizedQuery: string,
): boolean {
  const nameUk = norm(ex?.name?.uk);
  const nameEn = norm(ex?.name?.en);
  const aliases = (ex?.aliases || []).map(norm).join(" ");
  const desc = norm(ex?.description);
  const group = norm(ex?.primaryGroup);
  const groupUk = norm(ex?.primaryGroupUk);
  return (
    nameUk.includes(normalizedQuery) ||
    nameEn.includes(normalizedQuery) ||
    aliases.includes(normalizedQuery) ||
    desc.includes(normalizedQuery) ||
    group.includes(normalizedQuery) ||
    groupUk.includes(normalizedQuery)
  );
}

/**
 * Наскільки влучно запит попадає у вправу: точна назва чи аліас важать
 * більше за випадкове входження в опис. Без цього «станова» ховає саму
 * станову за трьома вправами, у назві яких це слово теж є.
 */
function searchRank(
  ex: SearchableExerciseDef | null | undefined,
  normalizedQuery: string,
): number {
  const labels = [ex?.name?.uk, ex?.name?.en, ...(ex?.aliases || [])].map(norm);
  if (labels.some((l) => l === normalizedQuery)) return 3;
  if (labels.some((l) => l.startsWith(normalizedQuery))) return 2;
  if (labels.some((l) => l.includes(normalizedQuery))) return 1;
  return 0;
}

/**
 * Повнотекстовий пошук по локальному каталогу (uk/en назви, aliases,
 * description, primary group). Повертає всі вправи, якщо query порожній.
 * Результати впорядковані за влучністю збігу, всередині рангу зберігають
 * порядок каталогу.
 */
export function searchExercises(
  query: string,
  pool: RawExerciseDef[] = EXERCISES,
): RawExerciseDef[] {
  const q = norm(query);
  if (!q) return pool.slice();
  return pool
    .filter((ex) => matchesExerciseSearch(ex, q))
    .map((ex, index) => ({ ex, index, rank: searchRank(ex, q) }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map((row) => row.ex);
}

/** Де вправу реально можна виконати. */
export type ExerciseLocation = "gym" | "home" | "outdoor";

export const EXERCISE_LOCATIONS: readonly ExerciseLocation[] = [
  "gym",
  "home",
  "outdoor",
];

/**
 * Локація виводиться з наявного `equipment`, окремого поля в JSON немає:
 * одне джерело істини замість двох, які встигнуть розійтись.
 */
const EQUIPMENT_LOCATIONS: Record<string, readonly ExerciseLocation[]> = {
  bodyweight: ["home", "outdoor"],
  band: ["home", "outdoor"],
  dumbbell: ["home", "gym"],
  kettlebell: ["home", "gym"],
  barbell: ["gym"],
  bench: ["gym"],
  cable: ["gym"],
  machine: ["gym"],
  other: ["gym"],
};

/**
 * Локації вправи. Вправа без відомого обладнання лишається залом: це
 * найвужче припущення, і воно не обіцяє людині вдома того, чого вона
 * не зможе зробити.
 */
export function getExerciseLocations(
  ex: { equipment?: string[] } | null | undefined,
): ExerciseLocation[] {
  const out = new Set<ExerciseLocation>();
  for (const eq of ex?.equipment || []) {
    for (const loc of EQUIPMENT_LOCATIONS[eq] || []) out.add(loc);
  }
  if (out.size === 0) out.add("gym");
  return EXERCISE_LOCATIONS.filter((loc) => out.has(loc));
}

/** Чи доступна вправа в заданій локації. */
export function matchesExerciseLocation(
  ex: { equipment?: string[] } | null | undefined,
  location: ExerciseLocation | "" | null | undefined,
): boolean {
  if (!location) return true;
  return getExerciseLocations(ex).includes(location);
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
