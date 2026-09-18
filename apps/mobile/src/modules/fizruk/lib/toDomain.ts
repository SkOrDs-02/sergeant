/**
 * Adapters from loose mobile fizruk view-model shapes to the strict
 * `@sergeant/fizruk-domain` `Workout` / `WorkoutItem` types.
 *
 * Mobile keeps a partial view-model on read (`FizrukWorkout` with
 * optional `exerciseId` / `nameUk` / etc.) so screens can render
 * incrementally-loaded SQLite payloads. Pure selectors in the
 * `@sergeant/fizruk-domain` package still expect the canonical
 * `Workout` shape. Rather than `as unknown as Workout` double-casts
 * we materialise the missing fields with safe defaults — the
 * downstream selectors only branch on `type` / `sets[].weightKg` /
 * `sets[].reps` / `items[].musclesPrimary`, all of which round-trip
 * cleanly through the defaults.
 *
 * Allocation is per-render; callers wrap in `useMemo` already (and
 * the data set is small — one screen at a time).
 */

import type {
  Workout as DomainWorkout,
  WorkoutItem as DomainWorkoutItem,
} from "@sergeant/fizruk-domain/domain";

import type {
  FizrukWorkout,
  FizrukWorkoutItem,
} from "../hooks/useFizrukWorkouts";

function toDomainWorkoutItem(item: FizrukWorkoutItem): DomainWorkoutItem {
  const out: DomainWorkoutItem = {
    id: item.id,
    exerciseId: item.exerciseId ?? "",
    nameUk: item.nameUk ?? "",
    primaryGroup: item.primaryGroup ?? "",
    musclesPrimary: item.musclesPrimary ?? [],
    musclesSecondary: item.musclesSecondary ?? [],
    type: item.type ?? "strength",
  };
  if (item.sets) out.sets = item.sets;
  if (item.durationSec != null) out.durationSec = item.durationSec;
  if (item.distanceM != null) out.distanceM = item.distanceM;
  return out;
}

export function toDomainWorkout(fw: FizrukWorkout): DomainWorkout {
  return {
    id: fw.id,
    startedAt: fw.startedAt,
    endedAt: fw.endedAt,
    note: fw.note,
    warmup: fw.warmup,
    cooldown: fw.cooldown,
    items: fw.items.map(toDomainWorkoutItem),
    groups: fw.groups,
    wellbeing: null,
  };
}

export function toDomainWorkouts(
  fws: readonly FizrukWorkout[],
): readonly DomainWorkout[] {
  return fws.map(toDomainWorkout);
}
