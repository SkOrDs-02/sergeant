/**
 * Last validated: 2026-06-12
 * Status: Active
 *
 * Bridges recovery state (`useRecovery().by`) to the BodyAtlas render input:
 * folds domain muscles onto the canonical atlas keyspace (via the domain
 * `aggregateRecoveryToAtlas`) and attaches the exercise chips each group
 * shows in its detail card. Shared by the Atlas page and the dashboard
 * RecoveryFocusCard so neither re-derives the muscle→atlas join.
 */
import {
  aggregateRecoveryToAtlas,
  getExerciseNamesByAtlasMuscle,
  type BodyAtlasMuscleId,
} from "@sergeant/fizruk-domain/data";
import type { MuscleState, RecoveryStatus } from "@sergeant/fizruk-domain";

/** Per-muscle data the atlas paints and surfaces in the selected card. */
export interface AtlasMuscleDatum {
  /** Recovery fatigue, 0..1 (drives the heat map in "recovery" mode). */
  fatigue: number;
  daysSince: number | null;
  load7d: number;
  status: RecoveryStatus;
  /** Ukrainian exercise names targeting this group (card chips). */
  exercises: string[];
}

export type AtlasData = Partial<Record<BodyAtlasMuscleId, AtlasMuscleDatum>>;

/** Build atlas render input from a `useRecovery().by` map. */
export function buildAtlasData(
  by: Record<string, MuscleState> | null | undefined,
): AtlasData {
  const aggregated = aggregateRecoveryToAtlas(Object.values(by || {}));
  const out: AtlasData = {};
  for (const id of Object.keys(aggregated) as BodyAtlasMuscleId[]) {
    const datum = aggregated[id];
    if (!datum) continue;
    out[id] = { ...datum, exercises: getExerciseNamesByAtlasMuscle(id) };
  }
  return out;
}
