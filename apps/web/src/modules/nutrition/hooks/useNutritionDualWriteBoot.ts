/**
 * Last validated: 2026-06-15
 * Status: Active
 * React hook that installs the Nutrition dual-write context.
 *
 * Stage 4 PR #032 of `docs/planning/storage-roadmap.md`. Mirror of
 * `useFizrukDualWriteBoot`.
 *
 * Stage 8 PR #056n dropped the `feature.nutrition.sqlite_v2.dual_write`
 * flag — registration is now `userId`-gated only.
 */

import { useEffect } from "react";
import { useLocalUserId } from "../../../core/auth/useLocalUserId";
import { bootNutritionDualWrite } from "../lib/dualWriteBoot.js";

export function useNutritionDualWriteBoot(): void {
  const userId = useLocalUserId();

  useEffect(() => {
    if (!userId) return;
    const teardown = bootNutritionDualWrite({
      getUserId: () => userId,
    });
    return teardown;
  }, [userId]);
}
