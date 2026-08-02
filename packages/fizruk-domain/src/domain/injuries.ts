import {
  isBodyAtlasMuscleId,
  mapDomainMuscleToAtlas,
  type BodyAtlasMuscleId,
} from "../data/bodyAtlas.js";
import type { MuscleState } from "./types.js";

/** Local/server mirror of one user-marked injury interval. */
export interface FizrukInjury {
  id: string;
  userId: string;
  muscleGroup: BodyAtlasMuscleId;
  notedAt: string;
  clearedAt: string | null;
}

export function isActiveFizrukInjury(injury: FizrukInjury): boolean {
  return injury.clearedAt === null;
}

/**
 * Turn active atlas injury marks into hard recovery blocks.
 * Domain-muscle rows stay in the map for conflict detection, while consumers
 * can omit `injured` rows from positive recovery recommendations.
 */
export function applyInjuryHardBlocks(
  recovery: Readonly<Record<string, MuscleState>>,
  muscleGroups: Iterable<string>,
): Record<string, MuscleState> {
  const active = new Set<BodyAtlasMuscleId>();
  for (const group of muscleGroups) {
    if (isBodyAtlasMuscleId(group)) active.add(group);
  }

  const next: Record<string, MuscleState> = {};
  for (const [id, row] of Object.entries(recovery)) {
    const atlasId = mapDomainMuscleToAtlas(id);
    next[id] =
      atlasId && active.has(atlasId)
        ? { ...row, status: "red", injured: true }
        : { ...row, injured: false };
  }
  return next;
}
