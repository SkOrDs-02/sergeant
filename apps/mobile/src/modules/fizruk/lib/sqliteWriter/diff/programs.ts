/**
 * Programs-singleton diff for the Fizruk dual-write layer
 * (Stage 12.5 / PR #070f2-mobile-dualwrite). Per-shape
 * module-folder split from the monolithic `diff.ts` — see
 * `docs/audits/2026-05-13-mobile-reliability-ux-roast.md` § P2.2a.
 *
 * Mirrors the SQLite `fizruk_programs` row: just the active-program
 * id (or `null` when no program is active). `null` on `next` is
 * treated as cold cache (no-op); a hook that explicitly clears the
 * active program emits a snapshot with `activeProgramId === null`
 * rather than `programs === null`.
 */

export interface FizrukProgramsSnapshot {
  readonly activeProgramId: string | null;
}

export interface ProgramsSetOp {
  readonly kind: "programs-set";
  readonly programs: FizrukProgramsSnapshot;
}

export type ProgramsOp = ProgramsSetOp;

export function diffProgramsOps(
  prev: FizrukProgramsSnapshot | null | undefined,
  next: FizrukProgramsSnapshot | null | undefined,
): ProgramsOp[] {
  const prevPrograms = prev ?? null;
  const nextPrograms = next ?? null;
  if (nextPrograms === null) return [];
  if (
    prevPrograms &&
    prevPrograms.activeProgramId === nextPrograms.activeProgramId
  ) {
    return [];
  }
  return [{ kind: "programs-set", programs: nextPrograms }];
}
