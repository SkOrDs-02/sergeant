/**
 * React hook that installs the mobile Fizruk dual-write context.
 *
 * PR #028 follow-up of `docs/planning/storage-roadmap.md`. Mirrors
 * `useRoutineDualWriteBoot` — see that file for rationale.
 */

import { useEffect } from "react";

import { useUser } from "@sergeant/api-client/react";
import {
  EXPERIMENTAL_FLAGS,
  FLAGS_KEY,
  useFlag,
  type FlagValues,
} from "@/core/lib/featureFlags";
import { safeReadLS } from "@/lib/storage";

import { bootFizrukDualWrite } from "../lib/dualWriteBoot";

const FLAG_ID = "feature.fizruk.sqlite_v2.dual_write";

function readFlagFromStorage(): boolean {
  const stored = safeReadLS<FlagValues>(FLAGS_KEY, null);
  if (stored && typeof stored === "object") {
    const v = stored[FLAG_ID];
    if (typeof v === "boolean") return v;
  }
  const def = EXPERIMENTAL_FLAGS.find((f) => f.id === FLAG_ID);
  return def ? def.defaultValue : false;
}

export function useFizrukDualWriteBoot(): void {
  const { data: user } = useUser({
    retry: false,
    refetchOnWindowFocus: false,
  });
  const userId = user?.user?.id ?? null;
  const flagOn = useFlag(FLAG_ID);

  useEffect(() => {
    if (!userId || !flagOn) return;
    const teardown = bootFizrukDualWrite({
      getUserId: () => userId,
      isFlagEnabled: () => readFlagFromStorage(),
    });
    return teardown;
  }, [userId, flagOn]);
}
