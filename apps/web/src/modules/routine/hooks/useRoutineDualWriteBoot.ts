/**
 * React hook that installs the routine dual-write context.
 *
 * PR #024 follow-up of `docs/planning/storage-roadmap.md` — wires
 * `bootRoutineDualWrite()` into the module root so the dual-write
 * pipeline is no longer dormant in production. Mirrors the shape of
 * `useSqliteReadBoot` (PR #025 boot wiring) so both stages share the
 * same lifecycle: mount once the user is known, tear down on flag
 * toggle / unmount.
 *
 * Behaviour:
 *  - When `userId` is null OR the dual-write flag is off, no context
 *    is registered. The LS-write layer's `isRoutineDualWriteRegistered`
 *    check stays `false` and the per-write `peekRoutineDualWritePrev`
 *    read is skipped (preserving the off-flag perf characteristic).
 *  - When both gates pass, the context is registered for the lifetime
 *    of the effect — toggling the flag off, signing out, or
 *    unmounting `RoutineApp` runs the teardown returned by
 *    `bootRoutineDualWrite`.
 *
 * The hook is fire-and-forget — boot does no async work itself, and
 * the dual-write orchestrator's promise never rejects. The caller does
 * NOT need to gate rendering on this.
 */

import { useEffect } from "react";
import { useAuth } from "../../../core/auth/AuthContext";
import { useFlag, getFlag } from "../../../core/lib/featureFlags.js";
import { bootRoutineDualWrite } from "../lib/dualWriteBoot.js";

const FLAG_ID = "feature.routine.sqlite_v2.dual_write";

export function useRoutineDualWriteBoot(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const flagOn = useFlag(FLAG_ID);

  useEffect(() => {
    if (!userId || !flagOn) return;
    const teardown = bootRoutineDualWrite({
      // Read the live values on each call so a flag toggle or auth
      // change between dual-write triggers is observed without
      // re-registration. The `flagOn` dependency above also swaps the
      // registration when the user disables the flag, so
      // `isRoutineDualWriteRegistered()` returns false synchronously.
      getUserId: () => userId,
      isFlagEnabled: () => getFlag(FLAG_ID),
    });
    return teardown;
  }, [userId, flagOn]);
}
