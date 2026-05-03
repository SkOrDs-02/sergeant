/**
 * React hook that installs the mobile routine dual-write context.
 *
 * PR #024 follow-up of `docs/planning/storage-roadmap.md`. Mirrors
 * `apps/web/src/modules/routine/hooks/useRoutineDualWriteBoot.ts`.
 *
 * Mobile-specific bits:
 *  - The user id comes from `useUser` (Better Auth `me` query) instead
 *    of the web `useAuth` context.
 *  - The flag is read reactively via `useFlag` (which sits on top of
 *    the MMKV-backed `useLocalStorage`). The same MMKV blob is read
 *    synchronously inside the dual-write context's `isEnabled`
 *    callback so a flag toggle between writes is observed without
 *    re-registration.
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

import { bootRoutineDualWrite } from "../lib/dualWriteBoot";

const FLAG_ID = "feature.routine.sqlite_v2.dual_write";

/**
 * Read the live flag value from the persisted MMKV blob. Used inside
 * `isEnabled` so the orchestrator picks up a toggle that happened
 * after registration, without forcing a re-mount.
 */
function readFlagFromStorage(): boolean {
  const stored = safeReadLS<FlagValues>(FLAGS_KEY, null);
  if (stored && typeof stored === "object") {
    const v = stored[FLAG_ID];
    if (typeof v === "boolean") return v;
  }
  const def = EXPERIMENTAL_FLAGS.find((f) => f.id === FLAG_ID);
  return def ? def.defaultValue : false;
}

export function useRoutineDualWriteBoot(): void {
  // Better Auth-backed `me` endpoint. Auth might not be resolved yet
  // on a cold start; the boot helper is no-op'd via the falsy `userId`
  // branch.
  const { data: user } = useUser({
    retry: false,
    refetchOnWindowFocus: false,
  });
  const userId = user?.user?.id ?? null;
  const flagOn = useFlag(FLAG_ID);

  useEffect(() => {
    if (!userId || !flagOn) return;
    const teardown = bootRoutineDualWrite({
      getUserId: () => userId,
      isFlagEnabled: () => readFlagFromStorage(),
    });
    return teardown;
  }, [userId, flagOn]);
}
