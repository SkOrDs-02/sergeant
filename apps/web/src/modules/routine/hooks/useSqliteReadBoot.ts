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
import { useAuth } from "../../../core/auth/AuthContext";
import {
  DEMO_LOCAL_USER_ID,
  isDemoActive,
} from "../../../core/onboarding/onboardingGate";
import { bootSqliteReadPath } from "../lib/sqliteReadBoot";
import { emitRoutineStorage } from "../lib/routineStorage";

export function useSqliteReadBoot(): void {
  const { user } = useAuth();
  // AI-CONTEXT: demo mode bypasses auth (no user id), but the SQLite
  // read-boot + residual `hub_routine_v1` LS->SQLite drain are
  // userId-gated. Falling back to a synthetic demo id lets the seeded
  // demo payload reach the read cache, so the Routine module is not
  // empty while the hub card shows the seeded "5/5" stats (QA D-001).
  const userId = user?.id ?? (isDemoActive() ? DEMO_LOCAL_USER_ID : null);
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
