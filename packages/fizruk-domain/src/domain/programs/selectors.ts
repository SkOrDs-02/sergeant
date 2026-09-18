/**
 * Pure selectors over the built-in program catalogue.
 *
 * These are the functions the mobile + web hooks call to look up the
 * active program from a (catalogue, persisted-id) pair. Kept tiny and
 * single-purpose so they compose cleanly in `useMemo` bodies.
 */

import { PROGRAM_CATALOGUE } from "./catalogue.js";
import type { TrainingProgramDef } from "./types.js";

/**
 * Look up a program by id within `catalogue`. Returns `null` when the
 * id is absent or empty. Defaults to the built-in {@link PROGRAM_CATALOGUE}
 * so callers that use the canonical catalogue don't have to pass it
 * explicitly.
 */
export function findProgramById(
  id: string | null | undefined,
  catalogue: readonly TrainingProgramDef[] = PROGRAM_CATALOGUE,
): TrainingProgramDef | null {
  if (typeof id !== "string" || id === "") return null;
  return catalogue.find((p) => p.id === id) ?? null;
}

/**
 * Resolve the currently-active program from a persisted
 * `activeProgramId`. Identical semantics to
 * {@link findProgramById}, kept as a distinct named export so
 * selector-style call sites stay self-documenting.
 */
export function resolveActiveProgram(
  activeProgramId: string | null | undefined,
  catalogue: readonly TrainingProgramDef[] = PROGRAM_CATALOGUE,
): TrainingProgramDef | null {
  return findProgramById(activeProgramId, catalogue);
}
