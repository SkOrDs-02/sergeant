/**
 * React hook that boots the SQLite read path for routine completions.
 *
 * PR #025 of `docs/planning/storage-roadmap.md`. When the
 * `feature.routine.sqlite_v2.read_sqlite` flag is on, this hook runs
 * `bootSqliteReadPath()` once after mount so that subsequent
 * `loadRoutineState()` calls overlay completions from the local
 * `routine_entries` table instead of from the LS blob.
 *
 * The hook is intentionally fire-and-forget — boot failures fall back
 * to LS silently (console warning only). The caller does NOT need to
 * gate rendering on the boot promise.
 */

import { useEffect, useRef } from "react";
import { useLocalUserId } from "../../../core/auth/useLocalUserId";
import { bootSqliteReadPath } from "../lib/sqliteReadBoot";
import { emitRoutineStorage } from "../lib/routineStorage";

export function useSqliteReadBoot(): void {
  // AI-CONTEXT: demo and anonymous sessions both bypass auth (no user
  // id), but the SQLite read-boot + residual `hub_routine_v1`
  // LS->SQLite drain are userId-gated. `useLocalUserId` hands out a
  // synthetic id for both, so the seeded demo payload reaches the read
  // cache (QA D-001) and an anonymous visitor reads back what
  // `useRoutineDualWriteBoot` wrote under the same id.
  const userId = useLocalUserId();
  const didBoot = useRef(false);

  useEffect(() => {
    if (didBoot.current || !userId) return;
    didBoot.current = true;

    void bootSqliteReadPath(userId).then((activated) => {
      if (activated) {
        // Re-emit so any mounted useRoutineState hooks re-read with
        // the SQLite-overlaid completions.
        emitRoutineStorage();
      }
    });
  }, [userId]);
}
