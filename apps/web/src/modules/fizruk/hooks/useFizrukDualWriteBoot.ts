/**
 * React hook that installs the Fizruk dual-write context.
 *
 * PR #028 follow-up of `docs/planning/storage-roadmap.md`. Mirrors
 * `useRoutineDualWriteBoot` — see that file for the rationale.
 */

import { useEffect } from "react";
import { useAuth } from "../../../core/auth/AuthContext";
import { useFlag, getFlag } from "../../../core/lib/featureFlags.js";
import { bootFizrukDualWrite } from "../lib/dualWriteBoot.js";

const FLAG_ID = "feature.fizruk.sqlite_v2.dual_write";

export function useFizrukDualWriteBoot(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const flagOn = useFlag(FLAG_ID);

  useEffect(() => {
    if (!userId || !flagOn) return;
    const teardown = bootFizrukDualWrite({
      getUserId: () => userId,
      isFlagEnabled: () => getFlag(FLAG_ID),
    });
    return teardown;
  }, [userId, flagOn]);
}
