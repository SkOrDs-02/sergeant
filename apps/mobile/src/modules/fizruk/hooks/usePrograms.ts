/**
 * `usePrograms` — mobile hook for the Fizruk **Programs** screen
 * (Phase 6 · PR-F).
 *
 * Mirrors the public surface of the web hook at
 * `apps/web/src/modules/fizruk/hooks/useTrainingProgram.ts` — a
 * read-only list of catalogue entries plus an active-program slot
 * that can be activated / deactivated / toggled.
 *
 * Stage 12.5 / PR #057f2-tombstone-mobile-stage12-5 of
 * `docs/planning/storage-roadmap.md`. The active-program id is now
 * read from the SQLite warm cache (`getCachedFizrukSqliteState`) and
 * persisted exclusively through the dual-write pipeline
 * (`triggerFizrukDualWrite`). The legacy MMKV slot
 * `STORAGE_KEYS.FIZRUK_ACTIVE_PROGRAM` is drained on first boot via
 * `importFizrukResidualFromMmkv` and removed.
 *
 * Pre-boot / pre-auth (cache cold, `refreshedAt === null`) the hook
 * starts on `defaultActiveProgramState()` and overlays once
 * `useFizrukSqliteReadTick` fires.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  PROGRAM_CATALOGUE,
  defaultActiveProgramState,
  resolveActiveProgram,
  resolveTodaySession,
  type ActiveProgramState,
  type TodayProgramSession,
  type TrainingProgramDef,
} from "@sergeant/fizruk-domain/domain";

import { triggerFizrukDualWrite } from "../lib/dualWrite";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractProgramsSnapshot,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";
import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

/** Project the cached programs singleton onto the hook state shape.
 *  `null` (= "no row yet") collapses onto `defaultActiveProgramState()`. */
function projectFromCache(
  row: { activeProgramId: string | null } | null,
): ActiveProgramState {
  if (row === null) return defaultActiveProgramState();
  return { activeProgramId: row.activeProgramId };
}

/** Read the initial state from the warm cache, or the default if cold. */
function loadInitialState(): ActiveProgramState {
  const cache = getCachedFizrukSqliteState();
  if (cache.refreshedAt === null) return defaultActiveProgramState();
  return projectFromCache(cache.programs);
}

export interface UseProgramsResult {
  /** Full built-in catalogue, in display order. */
  programs: readonly TrainingProgramDef[];
  /** Persisted active-program id, or `null` if none is active. */
  activeProgramId: string | null;
  /** Resolved active program (catalogue entry), or `null` if none is active. */
  activeProgram: TrainingProgramDef | null;
  /**
   * Today's session for the active program (or `null` on a rest day
   * / when no program is active). Derived from the current system
   * clock — refreshes whenever `activeProgramId` changes or the
   * consumer remounts.
   */
  todaySession: TodayProgramSession | null;
  /** Activate a program by id. */
  activateProgram: (id: string) => void;
  /** Clear the active program slot. */
  deactivateProgram: () => void;
  /** Flip the active slot: activate if inactive, deactivate otherwise. */
  toggleProgram: (id: string) => void;
}

/**
 * Reads the persisted active-program id from the SQLite warm cache,
 * subscribes to refresh ticks so external writes (incoming sync,
 * residual-import) re-render this hook's copy, and exposes
 * imperative activate/deactivate handlers that persist exclusively
 * via the dual-write pipeline.
 */
export function usePrograms(
  /**
   * Override the catalogue (test seam). Defaults to the package's
   * canonical built-in list.
   */
  catalogue: readonly TrainingProgramDef[] = PROGRAM_CATALOGUE,
  /** Override for unit tests — defaults to the real wall clock. */
  now: () => Date = () => new Date(),
): UseProgramsResult {
  const [state, setState] = useState<ActiveProgramState>(loadInitialState);
  // Mirror the latest cache-derived state in a ref so the imperative
  // setters can build the dual-write `prev → next` pair without
  // depending on a stale closure of `state`.
  const stateRef = useRef<ActiveProgramState>(state);

  // Stage 12.5 / PR #057f2-tombstone-mobile-stage12-5: overlay
  // programs from the SQLite warm cache once it's available.
  const sqliteCacheTick = useFizrukSqliteReadTick();
  useEffect(() => {
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    const overlay = projectFromCache(cache.programs);
    stateRef.current = overlay;
    setState(overlay);
  }, [sqliteCacheTick]);

  const persist = useCallback((next: ActiveProgramState) => {
    const prev = stateRef.current;
    if (prev.activeProgramId === next.activeProgramId) return;
    stateRef.current = next;
    setState(next);
    // Stage 12.5 / PR #057f2-tombstone-mobile-stage12-5 — mirror to
    // SQLite via the dual-write pipeline only (no MMKV write).
    const baseState =
      peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
    try {
      triggerFizrukDualWrite(
        { ...baseState, programs: extractProgramsSnapshot(prev) },
        { ...baseState, programs: extractProgramsSnapshot(next) },
      );
    } catch {
      /* trigger is fire-and-forget — never propagate */
    }
  }, []);

  const activateProgram = useCallback(
    (id: string) => {
      const exists = catalogue.some((p) => p.id === id);
      if (!exists) return;
      persist({ activeProgramId: id });
    },
    [catalogue, persist],
  );

  const deactivateProgram = useCallback(() => {
    persist(defaultActiveProgramState());
  }, [persist]);

  const toggleProgram = useCallback(
    (id: string) => {
      if (state.activeProgramId === id) {
        deactivateProgram();
      } else {
        activateProgram(id);
      }
    },
    [state.activeProgramId, activateProgram, deactivateProgram],
  );

  const activeProgram = useMemo(
    () => resolveActiveProgram(state.activeProgramId, catalogue),
    [state.activeProgramId, catalogue],
  );

  const todaySession = useMemo(
    () => resolveTodaySession(activeProgram, now()),
    [activeProgram, now],
  );

  return {
    programs: catalogue,
    activeProgramId: state.activeProgramId,
    activeProgram,
    todaySession,
    activateProgram,
    deactivateProgram,
    toggleProgram,
  };
}
