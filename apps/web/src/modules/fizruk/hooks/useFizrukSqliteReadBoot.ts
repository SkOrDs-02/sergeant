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
import { useAuth } from "../../../core/auth/AuthContext";
import { bootFizrukSqliteReadPath } from "../lib/sqliteReadBoot";
import { notifyFizrukSqliteCacheRefresh } from "../lib/sqliteReadGate";

export function useFizrukSqliteReadBoot(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;
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
