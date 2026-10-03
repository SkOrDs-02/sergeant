/**
 * React hook that installs the mobile Fizruk dual-write context.
 *
 * PR #028 follow-up of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`. Mirrors
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
