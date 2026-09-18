/**
 * React hook that installs the Finyk dual-write context.
 *
 * Stage 4 PR #036 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`. Mirror of
 * `useNutritionDualWriteBoot`.
 *
 * Stage 8 PR #056k dropped the `feature.finyk.sqlite_v2.dual_write`
 * flag — registration is now `userId`-gated only.
 */

import { useEffect } from "react";
import { useLocalUserId } from "../../../core/auth/useLocalUserId";
import { bootFinykDualWrite } from "../lib/dualWriteBoot.js";

export function useFinykDualWriteBoot(): void {
  const userId = useLocalUserId();

  useEffect(() => {
    if (!userId) return;
    const teardown = bootFinykDualWrite({
      getUserId: () => userId,
    });
    return teardown;
  }, [userId]);
}
