/**
 * `usePrograms` — mobile hook for the Fizruk **Programs** screen
 * (Phase 6 · PR-F).
 *
 * Mirrors the public surface of the web hook at
 * `apps/web/src/modules/fizruk/hooks/useTrainingProgram.ts` — a
 * read-only list of catalogue entries plus an active-program slot
 * that can be activated / deactivated / toggled. The active-program
 * id is persisted in the shared MMKV slot
 * `STORAGE_KEYS.FIZRUK_ACTIVE_PROGRAM` so the same CloudSync entry
 * the web app writes to is reused verbatim.
 *
 * All pure logic (catalogue, today-session resolution, state
 * normalisation) lives in `@sergeant/fizruk-domain/domain/programs`
 * and is covered by vitest in isolation. This file is a thin React
 * shim around those selectors + MMKV.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  PROGRAM_CATALOGUE,
  defaultActiveProgramState,
  normalizeActiveProgramState,
  resolveActiveProgram,
  resolveTodaySession,
  type ActiveProgramState,
  type TodayProgramSession,
  type TrainingProgramDef,
} from "@sergeant/fizruk-domain/domain";
import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance, safeReadLS, safeWriteLS } from "@/lib/storage";
import { triggerFizrukDualWrite } from "../lib/dualWrite";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractProgramsSnapshot,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";

const STORAGE_KEY = STORAGE_KEYS.FIZRUK_ACTIVE_PROGRAM;

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
 * Reads the persisted active-program id from MMKV, reacts to
 * cross-consumer writes (e.g. a parallel-ported web hook running in
 * the same process during Expo dev), and exposes imperative
 * activate/deactivate handlers.
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
  const [state, setState] = useState<ActiveProgramState>(() =>
    normalizeActiveProgramState(safeReadLS<unknown>(STORAGE_KEY, null)),
  );
  // Mirror the latest persisted state in a ref so the imperative
  // setters can build the dual-write `prev → next` pair without
  // depending on a stale closure of `state`.
  const stateRef = useRef<ActiveProgramState>(state);

  // React to out-of-band writes to the same MMKV slot so the page
  // re-renders if anything else in the app touches this key.
  useEffect(() => {
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((changedKey) => {
      if (changedKey !== STORAGE_KEY) return;
      const fresh = normalizeActiveProgramState(
        safeReadLS<unknown>(STORAGE_KEY, null),
      );
      stateRef.current = fresh;
      setState(fresh);
    });
    return () => sub.remove();
  }, []);

  const persist = useCallback((next: ActiveProgramState) => {
    const prev = stateRef.current;
    if (prev.activeProgramId === next.activeProgramId) return;
    stateRef.current = next;
    setState(next);
    safeWriteLS(STORAGE_KEY, next);
    // Stage 12.5 / PR #070f2-mobile-dualwrite — mirror to SQLite.
    // The cache-backed state seeds the dual-write input so the diff
    // sees the full Fizruk shape; only the `programs` slot moves.
    const baseState =
      peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
    triggerFizrukDualWrite(
      { ...baseState, programs: extractProgramsSnapshot(prev) },
      { ...baseState, programs: extractProgramsSnapshot(next) },
    );
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
