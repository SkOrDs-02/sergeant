/**
 * React hook that installs the mobile Nutrition dual-write context.
 *
 * Stage 4 PR #032 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`. Mirrors
 * `useFizrukDualWriteBoot` — see that file for rationale.
 *
 * Stage 8 PR #056n dropped the `feature.nutrition.sqlite_v2.dual_write`
 * flag — registration is now `userId`-gated only.
 */

import { useEffect } from "react";

import { useUser } from "@sergeant/api-client/react";

import { bootNutritionDualWrite } from "../lib/dualWriteBoot";

export function useNutritionDualWriteBoot(): void {
  const { data: user } = useUser({
    retry: false,
    refetchOnWindowFocus: false,
  });
  const userId = user?.user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    const teardown = bootNutritionDualWrite({
      getUserId: () => userId,
    });
    return teardown;
  }, [userId]);
}
