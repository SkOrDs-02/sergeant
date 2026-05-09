/**
 * React hook that boots the SQLite read path for mobile Routine.
 *
 * Stage 8 PR #057r-tombstone-mobile of `docs/planning/storage-roadmap.md`.
 * Mirror of `apps/mobile/src/modules/fizruk/hooks/useFizrukSqliteReadBoot.ts`.
 * Runs `bootRoutineSqliteReadPath()` once after mount so subsequent
 * reads in `useRoutineStore` overlay from the local `routine_*` SQLite
 * tables instead of the legacy MMKV blob.
 *
 * Fire-and-forget — boot failures fall back to MMKV silently (console
 * warning only). The caller does NOT need to gate rendering on the
 * boot promise.
 */

import { useEffect, useRef } from "react";
import { useUser } from "@sergeant/api-client/react";

import { bootRoutineSqliteReadPath } from "../lib/sqliteReadBoot";
import { notifyRoutineSqliteCacheRefresh } from "../lib/sqliteReadGate";

export function useRoutineSqliteReadBoot(): void {
  // `useUser` returns `MeResponse = { user: { id, ... } | null }` from
  // the Better Auth-backed `me` endpoint. See `CloudSyncProvider` for
  // the canonical unwrap. Auth might not be resolved yet on a cold
  // start; the boot helper is no-op'd via the falsy `userId` branch.
  const { data: user } = useUser({
    retry: false,
    refetchOnWindowFocus: false,
  });
  const userId = user?.user?.id ?? null;

  // Idempotency guard — `bootRoutineSqliteReadPath` does not latch
  // globally (matches the Fizruk / Nutrition / Finyk read-overlay
  // shape on mobile), so we hold the once-per-mount invariant here.
  const didBoot = useRef(false);

  useEffect(() => {
    if (didBoot.current || !userId) return;
    didBoot.current = true;

    void bootRoutineSqliteReadPath(userId).then((activated) => {
      if (activated) {
        // Notify consumers (useRoutineStore) that the cache is fresh
        // so they re-render with the SQLite overlay.
        notifyRoutineSqliteCacheRefresh();
      }
    });
  }, [userId]);
}
