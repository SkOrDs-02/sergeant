/**
 * React hook that installs the Nutrition dual-write context.
 *
 * Stage 4 PR #032 of `docs/planning/storage-roadmap.md`. Mirror of
 * `useFizrukDualWriteBoot`.
 */

import { useEffect } from "react";
import { useAuth } from "../../../core/auth/AuthContext";
import { useFlag, getFlag } from "../../../core/lib/featureFlags.js";
import { bootNutritionDualWrite } from "../lib/dualWriteBoot.js";

const FLAG_ID = "feature.nutrition.sqlite_v2.dual_write";

export function useNutritionDualWriteBoot(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const flagOn = useFlag(FLAG_ID);

  useEffect(() => {
    if (!userId || !flagOn) return;
    const teardown = bootNutritionDualWrite({
      getUserId: () => userId,
      isFlagEnabled: () => getFlag(FLAG_ID),
    });
    return teardown;
  }, [userId, flagOn]);
}
