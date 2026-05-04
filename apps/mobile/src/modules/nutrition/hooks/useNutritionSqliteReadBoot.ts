/**
 * React hook that boots the SQLite read path for mobile Харчування.
 *
 * PR #033 of `docs/planning/storage-roadmap.md` (mobile parity for
 * web PR #033). When the `feature.nutrition.sqlite_v2.read_sqlite` flag
 * is on, this hook runs `bootNutritionSqliteReadPath()` once after mount
 * so subsequent reads in `useNutritionLog` / `useNutritionPantries` /
 * `useNutritionPrefs` / `useSavedRecipesList` / `useSavedRecipeById`
 * overlay from the local `nutrition_*` SQLite tables instead of MMKV.
 *
 * Fire-and-forget — boot failures fall back to MMKV silently (console
 * warning only). The caller does NOT need to gate rendering on the
 * boot promise.
 *
 * Mirrors `apps/mobile/src/modules/fizruk/hooks/useFizrukSqliteReadBoot.ts`.
 */

import { useEffect, useRef } from "react";
import { useUser } from "@sergeant/api-client/react";

import { bootNutritionSqliteReadPath } from "../lib/sqliteReadBoot";
import { notifyNutritionSqliteCacheRefresh } from "../lib/sqliteReadGate";

export function useNutritionSqliteReadBoot(): void {
  // `useUser` returns `MeResponse = { user: { id, ... } | null }` from
  // the Better Auth-backed `me` endpoint. Auth might not be resolved
  // yet on a cold start; the boot helper is no-op'd via the falsy
  // `userId` branch.
  const { data: user } = useUser({
    retry: false,
    refetchOnWindowFocus: false,
  });
  const userId = user?.user?.id ?? null;

  // Idempotency guard — `bootNutritionSqliteReadPath` latches via its
  // module-level `booted` flag, but a quick remount before the boot
  // promise resolves would still queue a duplicate refresh; this hook
  // ref keeps the once-per-mount invariant explicit.
  const didBoot = useRef(false);

  useEffect(() => {
    if (didBoot.current || !userId) return;
    didBoot.current = true;

    void bootNutritionSqliteReadPath(userId).then((activated) => {
      if (activated) {
        // Notify consumers (useNutritionLog / useNutritionPantries /
        // useNutritionPrefs / saved-recipe hooks) that the cache is
        // fresh so they re-render with the SQLite overlay.
        notifyNutritionSqliteCacheRefresh();
      }
    });
  }, [userId]);
}
