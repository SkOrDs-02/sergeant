import { useCallback, useMemo } from "react";
import { activeInjurySites, type InjuryMark } from "@sergeant/fizruk-domain";
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
import { clearInjuryMark, markInjurySites } from "../lib/injuryRepository.js";
import {
  ANALYTICS_EVENTS,
  trackEvent,
} from "../../../core/observability/analytics";

/**
 * AI-CONTEXT: read-only view of the injury marks, deliberately auth-free.
 * The warm cache already holds the rows, so resolving a user id here would buy
 * nothing — and `useLocalUserId` throws outside `AuthProvider`. `useRecovery`
 * consumes this, and recovery is mounted by the workouts orchestrator, so
 * pulling auth in would make every consumer of that orchestrator unrenderable
 * without a provider. Mutations need the id; reads do not — keep the split.
 */
export function useActiveInjuries() {
  useFizrukSqliteReadTick();
  const injuries = getCachedFizrukSqliteState().injuries;
  const openMarks = useMemo(
    () => injuries.filter((mark) => !mark.clearedAt && !mark.deletedAt),
    [injuries],
  );
  // Sites, not marks: the domain resolver keys blocks off the site id.
  const activeSites = useMemo(() => activeInjurySites(injuries), [injuries]);
  return { injuries, openMarks, activeSites };
}

export function useInjuries() {
  const userId = useLocalUserId();
  const { injuries, openMarks, activeSites } = useActiveInjuries();

  const mark = useCallback(
    async (sites: Iterable<string>): Promise<InjuryMark[]> => {
      if (!userId) return [];
      const db = await getSqliteDb();
      const client = db.migrationClient();
      // eslint-disable-next-line no-restricted-syntax -- UTC-anchored wall-clock instant для started_at: це sync/LWW-контракт, а не Kyiv-межа доби
      const now = new Date().toISOString();
      const created = await markInjurySites(client, userId, sites, now);
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
    async (injuryId: string): Promise<boolean> => {
      if (!userId) return false;
      const db = await getSqliteDb();
      const client = db.migrationClient();
      const cleared = await clearInjuryMark(
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

  return { injuries, openMarks, activeSites, mark, clear };
}
