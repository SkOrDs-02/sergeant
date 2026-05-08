/**
 * React hook that installs the Fizruk dual-write context.
 *
 * PR #028 follow-up of `docs/planning/storage-roadmap.md`. Mirrors
 * `useRoutineDualWriteBoot` — see that file for the rationale.
 *
 * Stage 8 PR #056f dropped the `feature.fizruk.sqlite_v2.dual_write`
 * flag — registration is now `userId`-gated only.
 */

import { useEffect } from "react";
import { useAuth } from "../../../core/auth/AuthContext";
import { bootFizrukDualWrite } from "../lib/dualWriteBoot.js";

export function useFizrukDualWriteBoot(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    const teardown = bootFizrukDualWrite({
      getUserId: () => userId,
    });
    return teardown;
  }, [userId]);
}
