/**
 * Programs-singleton diff for the Fizruk dual-write layer.
 *
 * Mirrors the SQLite `fizruk_programs` row: just the active-program id (or
 * `null` when no program is active). The program catalogue itself
 * (`BUILTIN_PROGRAMS`) ships with the bundle and is not user state.
 *
 * `next === null` is a cold cache (no-op). A hook that explicitly clears the
 * active program emits a snapshot with `activeProgramId === null`, not
 * `programs === null`. Дзеркало `apps/mobile/.../diff/programs.ts`, щоб обидва
 * клієнти писали в `fizruk_programs` однаковою формою рядка.
 */

export interface FizrukProgramsSnapshot {
  readonly activeProgramId: string | null;
}

export interface ProgramsSetOp {
  readonly kind: "programs-set";
  readonly programs: FizrukProgramsSnapshot;
}

export function diffProgramsOps(
  prev: FizrukProgramsSnapshot | null | undefined,
  next: FizrukProgramsSnapshot | null | undefined,
): ProgramsSetOp[] {
  const prevPrograms = prev ?? null;
  const nextPrograms = next ?? null;
  if (nextPrograms === null) return [];
  if (prevPrograms === null) {
    // Рядка ще немає, а програма не обрана - писати нічого: порожній рядок
    // не відрізняється від відсутнього (читач віддає `null` в обох випадках).
    return nextPrograms.activeProgramId === null
      ? []
      : [{ kind: "programs-set", programs: nextPrograms }];
  }
  if (prevPrograms.activeProgramId === nextPrograms.activeProgramId) return [];
  return [{ kind: "programs-set", programs: nextPrograms }];
}
