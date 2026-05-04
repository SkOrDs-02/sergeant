/**
 * React hook that boots the SQLite read path for Finyk.
 *
 * PR #037 of `docs/planning/storage-roadmap.md`. When the
 * `feature.finyk.sqlite_v2.read_sqlite` flag is on, this hook runs
 * `bootFinykSqliteReadPath()` once after mount so subsequent reads
 * in the finyk slot bundle (`useFinykStorageSlots`) overlay from the
 * local `finyk_*` SQLite tables instead of LS.
 *
 * Fire-and-forget — boot failures fall back to LS silently (console
 * warning only). The caller does NOT need to gate rendering on the
 * boot promise.
 *
 * Mirrors `apps/web/src/modules/nutrition/hooks/useNutritionSqliteReadBoot.ts`
 * and `apps/web/src/modules/fizruk/hooks/useFizrukSqliteReadBoot.ts`.
 */

import { useEffect, useRef } from "react";
import { useAuth } from "../../../core/auth/AuthContext";
import { bootFinykSqliteReadPath } from "../lib/sqliteReadBoot";
import { notifyFinykSqliteCacheRefresh } from "../lib/sqliteReadGate";

export function useFinykSqliteReadBoot(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const didBoot = useRef(false);

  useEffect(() => {
    if (didBoot.current || !userId) return;
    didBoot.current = true;

    void bootFinykSqliteReadPath(userId).then((activated) => {
      if (activated) {
        // Notify consumers (`useFinykStorageSlots` overlay) that the
        // cache is fresh so they re-render with the SQLite overlay.
        notifyFinykSqliteCacheRefresh();
      }
    });
  }, [userId]);
}
