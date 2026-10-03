/**
 * Exercise-catalogue selectors used by the mobile Workouts page.
 *
 * The web page inlines the same logic (`Workouts.tsx` §`grouped`
 * memo): filter by search string + muscle group, bucket by
 * `primaryGroup`, sort buckets by the stable `PRIMARY_GROUP_ORDER`
 * below. Lifting it here lets both platforms share the rules and
 * lets vitest exercise the branches without a React host.
 */

import { matchesExerciseSearch } from "../../data/index.js";
import type {
  WorkoutCatalogGroup,
  WorkoutExerciseCatalogEntry,
} from "./types.js";

/**
 * Stable ordering for primary-group buckets. Mirrors the web
 * `primaryGroupOrder` array in `Workouts.tsx`.
 */
export const PRIMARY_GROUP_ORDER: readonly string[] = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "quadriceps",
  "hamstrings",
  "calves",
  "glutes",
  "full_body",
  "cardio",
];

function norm(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

/** Pick the user-visible name for an exercise (uk → en → id). */
export function exerciseDisplayName(
  ex: WorkoutExerciseCatalogEntry | null | undefined,
): string {
  if (!ex) return "";
  return ex.name?.uk || ex.name?.en || ex.id || "";
}

/**
 * Full-text search across uk / en names, aliases, description and
 * primary group. Empty query returns the pool unchanged (copy).
 */
export function filterExercisesBySearch(
  exercises: readonly WorkoutExerciseCatalogEntry[],
  query: string,
): WorkoutExerciseCatalogEntry[] {
  const q = norm(query);
  if (!q) return exercises.slice();
  return exercises.filter((ex) => matchesExerciseSearch(ex, q));
}

/**
 * Narrow the pool to exercises whose `primaryGroup` matches. `null`
 * or empty id disables the filter (returns the pool unchanged).
 */
export function filterExercisesByPrimaryGroup(
  exercises: readonly WorkoutExerciseCatalogEntry[],
  primaryGroup: string | null | undefined,
): WorkoutExerciseCatalogEntry[] {
  if (!primaryGroup) return exercises.slice();
  return exercises.filter((ex) => ex?.primaryGroup === primaryGroup);
}

/**
 * Group exercises into buckets by `primaryGroup`, sorted by the
 * canonical {@link PRIMARY_GROUP_ORDER}. Each bucket's items preserve
 * the inbound order (stable). `primaryGroupsUk` feeds the Ukrainian
 * label on the bucket header.
 *
 * The `totalsBy` map holds the unfiltered per-group counts so the
 * header chip can show "visible / total" after a search.
 */
export function groupExercisesByPrimary(
  filtered: readonly WorkoutExerciseCatalogEntry[],
  options: {
    primaryGroupsUk?: Record<string, string>;
    totalsBy?: readonly WorkoutExerciseCatalogEntry[];
  } = {},
): WorkoutCatalogGroup[] {
  const { primaryGroupsUk = {}, totalsBy } = options;
  const byGroup = new Map<string, WorkoutExerciseCatalogEntry[]>();
  for (const ex of filtered) {
    const g = ex?.primaryGroup || "other";
    const bucket = byGroup.get(g) ?? [];
    bucket.push(ex);
    byGroup.set(g, bucket);
  }

  const totalsByGroup = new Map<string, number>();
  if (totalsBy) {
    for (const ex of totalsBy) {
      const g = ex?.primaryGroup || "other";
      totalsByGroup.set(g, (totalsByGroup.get(g) ?? 0) + 1);
    }
  }

  const orderIndex = new Map<string, number>();
  PRIMARY_GROUP_ORDER.forEach((id, idx) => orderIndex.set(id, idx));

  const groups: WorkoutCatalogGroup[] = [];
  for (const [id, items] of byGroup) {
    groups.push({
      id,
      label: primaryGroupsUk[id] || id,
      items,
      total: totalsByGroup.get(id) ?? items.length,
    });
  }
  groups.sort((a, b) => {
    const ai = orderIndex.has(a.id) ? orderIndex.get(a.id)! : 1e6;
    const bi = orderIndex.has(b.id) ? orderIndex.get(b.id)! : 1e6;
    if (ai !== bi) return ai - bi;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return groups;
}

/**
 * Narrow the pool to exercises that include at least one of the given
 * equipment tags. Empty / null `equipmentIds` disables the filter.
 */
export function filterExercisesByEquipment(
  exercises: readonly WorkoutExerciseCatalogEntry[],
  equipmentIds: readonly string[] | null | undefined,
): WorkoutExerciseCatalogEntry[] {
  if (!equipmentIds || equipmentIds.length === 0) return exercises.slice();
  const set = new Set(equipmentIds);
  return exercises.filter((ex) =>
    (ex?.equipment ?? []).some((e) => set.has(e)),
  );
}

/**
 * Composite helper — apply search + primary-group + equipment filter,
 * then bucket the result. Matches the single memo the web page builds.
 */
export function buildExerciseCatalogGroups(
  exercises: readonly WorkoutExerciseCatalogEntry[],
  options: {
    query?: string;
    primaryGroup?: string | null;
    equipment?: readonly string[] | null;
    primaryGroupsUk?: Record<string, string>;
  } = {},
): WorkoutCatalogGroup[] {
  const {
    query = "",
    primaryGroup = null,
    equipment = null,
    primaryGroupsUk = {},
  } = options;
  const bySearch = filterExercisesBySearch(exercises, query);
  const byGroup = filterExercisesByPrimaryGroup(bySearch, primaryGroup);
  const filtered = filterExercisesByEquipment(byGroup, equipment);
  return groupExercisesByPrimary(filtered, {
    primaryGroupsUk,
    totalsBy: exercises,
  });
}
