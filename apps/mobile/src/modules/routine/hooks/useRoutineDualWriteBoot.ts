/**
 * React hook that installs the mobile routine dual-write context.
 *
 * PR #024 follow-up of `docs/planning/storage-roadmap.md`. Mirrors
 * `apps/web/src/modules/routine/hooks/useRoutineDualWriteBoot.ts`.
 *
 * Stage 8 PR #056r dropped the `feature.routine.sqlite_v2.dual_write`
 * flag — registration is now `userId`-gated only.
 *
 * Mobile-specific bit: the user id comes from `useUser` (Better Auth
 * `me` query) instead of the web `useAuth` context.
 */

import { useEffect } from "react";

import { useUser } from "@sergeant/api-client/react";

import { bootRoutineDualWrite } from "../lib/dualWriteBoot";

export function useRoutineDualWriteBoot(): void {
  // Better Auth-backed `me` endpoint. Auth might not be resolved yet
  // on a cold start; the boot helper is no-op'd via the falsy `userId`
  // branch.
  const { data: user } = useUser({
    retry: false,
    refetchOnWindowFocus: false,
  });
  const userId = user?.user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    const teardown = bootRoutineDualWrite({
      getUserId: () => userId,
    });
    return teardown;
  }, [userId]);
}
