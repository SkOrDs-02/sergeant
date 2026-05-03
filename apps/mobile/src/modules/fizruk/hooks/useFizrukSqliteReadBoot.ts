/**
 * React hook that boots the SQLite read path for mobile Фізрук.
 *
 * PR #029a of `docs/planning/storage-roadmap.md` (mobile parity for
 * web PR #029). When the `feature.fizruk.sqlite_v2.read_sqlite` flag
 * is on, this hook runs `bootFizrukSqliteReadPath()` once after mount
 * so subsequent reads in `useFizrukWorkouts` / `useExerciseCatalog` /
 * `useMeasurements` overlay from the local `fizruk_*` SQLite tables
 * instead of MMKV.
 *
 * Fire-and-forget — boot failures fall back to MMKV silently (console
 * warning only). The caller does NOT need to gate rendering on the
 * boot promise.
 */

import { useEffect, useRef } from "react";
import { useUser } from "@sergeant/api-client/react";

import { bootFizrukSqliteReadPath } from "../lib/sqliteReadBoot";
import { notifyFizrukSqliteCacheRefresh } from "../lib/sqliteReadGate";

export function useFizrukSqliteReadBoot(): void {
  // `useUser` returns `MeResponse = { user: { id, ... } | null }` from
  // the Better Auth-backed `me` endpoint. See `CloudSyncProvider` for
  // the canonical unwrap. Auth might not be resolved yet on a cold
  // start; the boot helper is no-op'd via the falsy `userId` branch.
  const { data: user } = useUser({
    retry: false,
    refetchOnWindowFocus: false,
  });
  const userId = user?.user?.id ?? null;

  // Idempotency guard — `bootFizrukSqliteReadPath` does not latch
  // globally (matches the routine read-overlay shape on mobile), so we
  // hold the once-per-mount invariant here.
  const didBoot = useRef(false);

  useEffect(() => {
    if (didBoot.current || !userId) return;
    didBoot.current = true;

    void bootFizrukSqliteReadPath(userId).then((activated) => {
      if (activated) {
        // Notify consumers (useFizrukWorkouts / useMeasurements /
        // useExerciseCatalog) that the cache is fresh so they
        // re-render with the SQLite overlay.
        notifyFizrukSqliteCacheRefresh();
      }
    });
  }, [userId]);
}
