/**
 * React hook that boots the SQLite read path for mobile Finyk.
 *
 * PR #037 of `docs/planning/storage-roadmap.md` (mobile parity for
 * web PR #037). When the `feature.finyk.sqlite_v2.read_sqlite` flag
 * is on, this hook runs `bootFinykSqliteReadPath()` once after mount
 * so subsequent reads in the finyk store hooks (`transactionsStore`,
 * `budgetsStore`, `assetsStore`, …) overlay from the local `finyk_*`
 * SQLite tables instead of MMKV.
 *
 * Fire-and-forget — boot failures fall back to MMKV silently (console
 * warning only). The caller does NOT need to gate rendering on the
 * boot promise.
 *
 * Mirrors `apps/mobile/src/modules/nutrition/hooks/useNutritionSqliteReadBoot.ts`.
 */

import { useEffect, useRef } from "react";
import { useUser } from "@sergeant/api-client/react";

import { bootFinykSqliteReadPath } from "../lib/sqliteReadBoot";
import { notifyFinykSqliteCacheRefresh } from "../lib/sqliteReadGate";

export function useFinykSqliteReadBoot(): void {
  // `useUser` returns `MeResponse = { user: { id, ... } | null }` from
  // the Better Auth-backed `me` endpoint. Auth might not be resolved
  // yet on a cold start; the boot helper is no-op'd via the falsy
  // `userId` branch.
  const { data: user } = useUser({
    retry: false,
    refetchOnWindowFocus: false,
  });
  const userId = user?.user?.id ?? null;

  // Idempotency guard — `bootFinykSqliteReadPath` is best-effort but
  // we still want a single boot call per mount, even on a quick
  // remount before the boot promise resolves.
  const didBoot = useRef(false);

  useEffect(() => {
    if (didBoot.current || !userId) return;
    didBoot.current = true;

    void bootFinykSqliteReadPath(userId).then((activated) => {
      if (activated) {
        // Notify consumers that the cache is fresh so they re-render
        // with the SQLite overlay.
        notifyFinykSqliteCacheRefresh();
      }
    });
  }, [userId]);
}
