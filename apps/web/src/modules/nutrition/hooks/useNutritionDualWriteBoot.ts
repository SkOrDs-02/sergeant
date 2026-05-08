/**
 * React hook that installs the Nutrition dual-write context.
 *
 * Stage 4 PR #032 of `docs/planning/storage-roadmap.md`. Mirror of
 * `useFizrukDualWriteBoot`.
 *
 * Stage 8 PR #056n dropped the `feature.nutrition.sqlite_v2.dual_write`
 * flag — registration is now `userId`-gated only.
 */

import { useEffect } from "react";
import { useAuth } from "../../../core/auth/AuthContext";
import { bootNutritionDualWrite } from "../lib/dualWriteBoot.js";

export function useNutritionDualWriteBoot(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    const teardown = bootNutritionDualWrite({
      getUserId: () => userId,
    });
    return teardown;
  }, [userId]);
}
