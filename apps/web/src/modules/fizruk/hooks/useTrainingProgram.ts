import { useDeviceDayKey } from "@shared/hooks/useDeviceDayKey";
import { useCallback, useMemo } from "react";
import { useSqliteTickOverlay } from "@shared/hooks/useSqliteTickOverlay";
import {
  ACTIVE_PROGRAM_KEY,
  BUILTIN_PROGRAMS,
  getTodaySession,
} from "@sergeant/fizruk-domain";
import {
  safeReadStringLS,
  safeRemoveLS,
  safeWriteLS,
} from "@shared/lib/storage/storage";

import {
  isFizrukDualWriteRegistered,
  triggerFizrukDualWrite,
} from "../lib/sqliteWriter/index";
import { extractProgramsSnapshot } from "../lib/fizrukDualWriteState";
import {
  fizrukDualWriteTransition,
  useFizrukIntendedSlice,
} from "../lib/fizrukDualWriteIntent";
import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

/**
 * Cache-first початковий стан: активна програма береться з теплого
 * SQLite-кешу (`fizruk_programs`). Холодний кеш (перший рендер до бута)
 * падає на застарілий LS-ключ - лише як pre-warm; одноразовий дрен LS ->
 * SQLite робить `drainLegacyActiveProgram` на бут читання.
 */
function loadInitialActiveProgramId(): string | null {
  const cache = getCachedFizrukSqliteState();
  if (cache.refreshedAt !== null)
    return cache.programs?.activeProgramId ?? null;
  return safeReadStringLS(ACTIVE_PROGRAM_KEY);
}

export function useTrainingProgram() {
  const dayKey = useDeviceDayKey();
  const sqliteCacheTick = useFizrukSqliteReadTick();
  const intended = useFizrukIntendedSlice<"programs">(sqliteCacheTick);
  const [activeProgramId, setActiveProgramId] = useSqliteTickOverlay<
    string | null
  >(
    sqliteCacheTick,
    () => {
      const cache = getCachedFizrukSqliteState();
      if (cache.refreshedAt === null) return undefined;
      return cache.programs?.activeProgramId ?? null;
    },
    loadInitialActiveProgramId,
  );

  const activeProgram = useMemo(
    () => BUILTIN_PROGRAMS.find((p) => p.id === activeProgramId) || null,
    [activeProgramId],
  );

  const persist = useCallback(
    (id: string | null) => {
      setActiveProgramId(id);
      // Явний вибір користувача витісняє застарілий LS-ключ: інакше
      // «знятий» вибір воскресне з нього при наступному буті. Гість без
      // зареєстрованого dual-write-контексту: тригер нижче - no-op, тож LS
      // лишається єдиним носієм вибору (інакше він жив би лише в стані React).
      if (isFizrukDualWriteRegistered() || id === null) {
        safeRemoveLS(ACTIVE_PROGRAM_KEY);
      } else {
        safeWriteLS(ACTIVE_PROGRAM_KEY, id);
      }
      // SQLite-only запис через dual-write (-> sync_op_outbox). Fire-and-forget;
      // без зареєстрованого контексту тригер - no-op.
      try {
        const transition = fizrukDualWriteTransition(
          "programs",
          intended,
          extractProgramsSnapshot({ activeProgramId: id }),
        );
        triggerFizrukDualWrite(transition.prev, transition.next);
      } catch {
        /* trigger is fire-and-forget - never propagate */
      }
    },
    [intended, setActiveProgramId],
  );

  const activateProgram = useCallback(
    (id: string | null) => persist(id || null),
    [persist],
  );

  const deactivateProgram = useCallback(() => persist(null), [persist]);

  const todaySession = useMemo(() => {
    void dayKey;
    return getTodaySession(activeProgram);
  }, [activeProgram, dayKey]);

  return {
    programs: BUILTIN_PROGRAMS,
    activeProgramId,
    activeProgram,
    todaySession,
    activateProgram,
    deactivateProgram,
  };
}
