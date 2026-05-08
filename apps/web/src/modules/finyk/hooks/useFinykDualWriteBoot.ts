/**
 * React hook that installs the Finyk dual-write context.
 *
 * Stage 4 PR #036 of `docs/planning/storage-roadmap.md`. Mirror of
 * `useNutritionDualWriteBoot`.
 *
 * Stage 8 PR #056k dropped the `feature.finyk.sqlite_v2.dual_write`
 * flag — registration is now `userId`-gated only.
 */

import { useEffect } from "react";
import { useAuth } from "../../../core/auth/AuthContext";
import { bootFinykDualWrite } from "../lib/dualWriteBoot.js";

export function useFinykDualWriteBoot(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    const teardown = bootFinykDualWrite({
      getUserId: () => userId,
    });
    return teardown;
  }, [userId]);
}
