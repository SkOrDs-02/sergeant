/**
 * React hook that installs the Finyk dual-write context.
 *
 * Stage 4 PR #036 of `docs/planning/storage-roadmap.md`. Mirror of
 * `useNutritionDualWriteBoot`.
 */

import { useEffect } from "react";
import { useAuth } from "../../../core/auth/AuthContext";
import { useFlag, getFlag } from "../../../core/lib/featureFlags.js";
import { bootFinykDualWrite } from "../lib/dualWriteBoot.js";

const FLAG_ID = "feature.finyk.sqlite_v2.dual_write";

export function useFinykDualWriteBoot(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const flagOn = useFlag(FLAG_ID);

  useEffect(() => {
    if (!userId || !flagOn) return;
    const teardown = bootFinykDualWrite({
      getUserId: () => userId,
      isFlagEnabled: () => getFlag(FLAG_ID),
    });
    return teardown;
  }, [userId, flagOn]);
}
