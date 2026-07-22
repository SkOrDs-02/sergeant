/**
 * React hook that boots the SQLite read path for Фізрук.
 *
 * PR #029 of `docs/planning/storage-roadmap.md`. When the
 * `feature.fizruk.sqlite_v2.read_sqlite` flag is on, this hook runs
 * `bootFizrukSqliteReadPath()` once after mount so subsequent reads
 * in `useWorkouts` / `useExerciseCatalog` / `useMeasurements` overlay
 * from the local `fizruk_*` SQLite tables instead of LS.
 *
 * Fire-and-forget — boot failures fall back to LS silently (console
 * warning only). The caller does NOT need to gate rendering on the
 * boot promise.
 */

import { useEffect, useRef } from "react";
import { useLocalUserId } from "../../../core/auth/useLocalUserId";
import { bootFizrukSqliteReadPath } from "../lib/sqliteReadBoot";
import { notifyFizrukSqliteCacheRefresh } from "../lib/sqliteReadGate";

export function useFizrukSqliteReadBoot(): void {
  // AI-CONTEXT: demo and anonymous sessions both bypass auth (no user
  // id), but the SQLite read-boot + residual `fizruk_*` LS->SQLite
  // drain are userId-gated. `useLocalUserId` hands out a synthetic id
  // for both, so the seeded demo payload reaches the read cache
  // (QA D-002) and an anonymous visitor reads back what
  // `useFizrukDualWriteBoot` wrote under the same id.
  const userId = useLocalUserId();
  const didBoot = useRef(false);

  useEffect(() => {
    if (didBoot.current || !userId) return;
    didBoot.current = true;

    void bootFizrukSqliteReadPath(userId).then((activated) => {
      if (activated) {
        // Notify consumers (useWorkouts/useMeasurements/useExerciseCatalog)
        // that the cache is fresh so they re-render with the SQLite
        // overlay.
        notifyFizrukSqliteCacheRefresh();
      }
    });
  }, [userId]);
}
