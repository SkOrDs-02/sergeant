import { useCallback, useEffect, useMemo, useState } from "react";
import { BUILTIN_PROGRAMS, getTodaySession } from "@sergeant/fizruk-domain";
import {
  safeReadStringLS,
  safeWriteLS,
  safeRemoveLS,
} from "@shared/lib/storage";

const ACTIVE_PROGRAM_KEY = "fizruk_active_program_id_v1";

export function useTrainingProgram() {
  const [activeProgramId, setActiveProgramId] = useState(() =>
    safeReadStringLS(ACTIVE_PROGRAM_KEY),
  );

  useEffect(() => {
    if (activeProgramId) {
      safeWriteLS(ACTIVE_PROGRAM_KEY, activeProgramId);
    } else {
      safeRemoveLS(ACTIVE_PROGRAM_KEY);
    }
  }, [activeProgramId]);

  const activeProgram = useMemo(
    () => BUILTIN_PROGRAMS.find((p) => p.id === activeProgramId) || null,
    [activeProgramId],
  );

  const activateProgram = useCallback((id: string | null) => {
    setActiveProgramId(id || null);
  }, []);

  const deactivateProgram = useCallback(() => {
    setActiveProgramId(null);
  }, []);

  const todaySession = useMemo(
    () => getTodaySession(activeProgram),
    [activeProgram],
  );

  return {
    programs: BUILTIN_PROGRAMS,
    activeProgramId,
    activeProgram,
    todaySession,
    activateProgram,
    deactivateProgram,
  };
}
