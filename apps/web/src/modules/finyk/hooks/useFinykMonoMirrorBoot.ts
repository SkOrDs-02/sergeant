/**
 * React hook that boots the SQLite Mono cache mirror.
 *
 * PR #038 of `docs/planning/storage-roadmap.md`. When the
 * `feature.finyk.sqlite_v2.mono_mirror` flag is on, this hook runs
 * `bootFinykMonoMirror()` once after mount so `useMonobankWebhook`
 * can overlay reads from the local `finyk_mono_*` tables instead of
 * blocking on the API fetch for cold-start renders.
 *
 * Fire-and-forget — boot failures fall back to LS silently (console
 * warning only). Render-time gating is the consumer's responsibility.
 */

import { useEffect, useRef } from "react";
import { useAuth } from "../../../core/auth/AuthContext";
import { bootFinykMonoMirror } from "../lib/monoMirrorBoot";
import { notifyFinykMonoMirrorRefresh } from "../lib/monoMirrorGate";

export function useFinykMonoMirrorBoot(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const didBoot = useRef(false);

  useEffect(() => {
    if (didBoot.current || !userId) return;
    didBoot.current = true;

    void bootFinykMonoMirror(userId).then((activated) => {
      if (activated) {
        notifyFinykMonoMirrorRefresh();
      }
    });
  }, [userId]);
}
