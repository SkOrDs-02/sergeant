import { useCallback, useMemo } from "react";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import { useLocalUserId } from "../../../core/auth/useLocalUserId.js";
import {
  getCachedFizrukSqliteState,
  refreshFizrukSqliteState,
} from "../lib/sqliteReader.js";
import {
  notifyFizrukSqliteCacheRefresh,
  useFizrukSqliteReadTick,
} from "../lib/sqliteReadGate.js";
import {
  clearFizrukInjury,
  markFizrukInjuries,
} from "../lib/injuryRepository.js";
import {
  ANALYTICS_EVENTS,
  trackEvent,
} from "../../../core/observability/analytics";

/**
 * AI-CONTEXT: read-only view of the injury list, deliberately auth-free.
 * The warm cache already holds the rows, so resolving a user id here
 * would buy nothing — and `useLocalUserId` throws outside `AuthProvider`.
 * `useRecovery` consumes this, and recovery is mounted by the workouts
 * orchestrator, so pulling auth in would make every consumer of that
 * orchestrator unrenderable without a provider. Mutations need the id;
 * reads do not — keep the split.
 */
export function useActiveInjuries() {
  useFizrukSqliteReadTick();
  const injuries = getCachedFizrukSqliteState().injuries;
  const activeInjuries = useMemo(
    () => injuries.filter((injury) => injury.clearedAt === null),
    [injuries],
  );
  return { injuries, activeInjuries };
}

export function useInjuries() {
  const userId = useLocalUserId();
  const { injuries, activeInjuries } = useActiveInjuries();

  const refresh = useCallback(async () => {
    if (!userId) return;
    const db = await getSqliteDb();
    const client = db.migrationClient();
    await refreshFizrukSqliteState(client, userId);
    notifyFizrukSqliteCacheRefresh();
  }, [userId]);

  const mark = useCallback(
    async (muscleGroups: Iterable<string>) => {
      if (!userId) return [];
      const db = await getSqliteDb();
      const client = db.migrationClient();
      // eslint-disable-next-line no-restricted-syntax -- UTC-anchored wall-clock instant для noted_at: це sync/LWW-контракт, а не Kyiv-межа доби
      const now = new Date().toISOString();
      const created = await markFizrukInjuries(
        client,
        userId,
        muscleGroups,
        now,
      );
      await refreshFizrukSqliteState(client, userId);
      notifyFizrukSqliteCacheRefresh();
      if (created.length > 0) {
        trackEvent(ANALYTICS_EVENTS.FIZRUK_INJURY_MARKED, {
          count: created.length,
        });
      }
      return created;
    },
    [userId],
  );

  const clear = useCallback(
    async (injuryId: string) => {
      if (!userId) return null;
      const db = await getSqliteDb();
      const client = db.migrationClient();
      const cleared = await clearFizrukInjury(
        client,
        userId,
        injuryId,
        // eslint-disable-next-line no-restricted-syntax -- UTC-anchored wall-clock instant для cleared_at: це sync/LWW-контракт, а не Kyiv-межа доби
        new Date().toISOString(),
      );
      await refreshFizrukSqliteState(client, userId);
      notifyFizrukSqliteCacheRefresh();
      if (cleared) trackEvent(ANALYTICS_EVENTS.FIZRUK_INJURY_CLEARED);
      return cleared;
    },
    [userId],
  );

  return { injuries, activeInjuries, mark, clear, refresh };
}
