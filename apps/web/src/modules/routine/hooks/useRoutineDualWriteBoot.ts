/**
 * React hook that installs the routine dual-write context.
 *
 * PR #024 follow-up of `docs/planning/storage-roadmap.md` — wires
 * `bootRoutineDualWrite()` into the module root so the dual-write
 * pipeline is no longer dormant in production. Mirrors the shape of
 * `useSqliteReadBoot` (PR #025 boot wiring) so both stages share the
 * same lifecycle: mount once the user is known, tear down on
 * unmount / sign-out.
 *
 * Stage 8 PR #056r dropped the `feature.routine.sqlite_v2.dual_write`
 * flag — registration is now `userId`-gated only.
 *
 * Behaviour:
 *  - The id comes from `useLocalUserId`, so anonymous and demo
 *    visitors register too — under a synthetic id in the `anon` SQLite
 *    partition. Gating this on a real account id used to drop every
 *    anonymous write on the floor (the record lived in the warm cache
 *    until reload and then disappeared).
 *  - While the session is still resolving the id is null and no
 *    context is registered. The LS-write layer's
 *    `isRoutineDualWriteRegistered` check stays `false` and the
 *    per-write `peekRoutineDualWritePrev` read is skipped.
 *  - Once the id is known, the context is registered for the lifetime
 *    of the effect — signing out or unmounting `RoutineApp` runs the
 *    teardown returned by `bootRoutineDualWrite`.
 *
 * The hook is fire-and-forget — boot does no async work itself, and
 * the dual-write orchestrator's promise never rejects. The caller does
 * NOT need to gate rendering on this.
 */

import { useEffect } from "react";
import { useLocalUserId } from "../../../core/auth/useLocalUserId";
import { bootRoutineDualWrite } from "../lib/dualWriteBoot.js";

export function useRoutineDualWriteBoot(): void {
  const userId = useLocalUserId();

  useEffect(() => {
    if (!userId) return;
    const teardown = bootRoutineDualWrite({
      // Read the live value on each call so an auth change between
      // dual-write triggers is observed without re-registration.
      getUserId: () => userId,
    });
    return teardown;
  }, [userId]);
}
