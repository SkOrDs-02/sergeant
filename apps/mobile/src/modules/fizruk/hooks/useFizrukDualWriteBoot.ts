/**
 * React hook that installs the mobile Fizruk dual-write context.
 *
 * PR #028 follow-up of `docs/planning/storage-roadmap.md`. Mirrors
 * `useRoutineDualWriteBoot` — see that file for rationale.
 *
 * Stage 8 PR #056f dropped the `feature.fizruk.sqlite_v2.dual_write`
 * flag — registration is now `userId`-gated only.
 */

import { useEffect } from "react";

import { useUser } from "@sergeant/api-client/react";

import { bootFizrukDualWrite } from "../lib/dualWriteBoot";

export function useFizrukDualWriteBoot(): void {
  const { data: user } = useUser({
    retry: false,
    refetchOnWindowFocus: false,
  });
  const userId = user?.user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    const teardown = bootFizrukDualWrite({
      getUserId: () => userId,
    });
    return teardown;
  }, [userId]);
}
