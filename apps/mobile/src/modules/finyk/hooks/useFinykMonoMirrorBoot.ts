/**
 * React hook that boots the SQLite Mono cache mirror on mobile.
 *
 * PR #038 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md` (mobile parity for
 * web PR #038). Stage 13 PR #078 retired the flag — the mirror now
 * boots unconditionally after mount so `transactionsStore` can overlay
 * reads from the local `finyk_mono_*` tables.
 *
 * Fire-and-forget — boot failures fall back to MMKV silently
 * (console warning only).
 */

import { useEffect, useRef } from "react";
import { useUser } from "@sergeant/api-client/react";

import { bootFinykMonoMirror } from "../lib/monoMirrorBoot";
import { notifyFinykMonoMirrorRefresh } from "../lib/monoMirrorGate";

export function useFinykMonoMirrorBoot(): void {
  const { data: user } = useUser({
    retry: false,
    refetchOnWindowFocus: false,
  });
  const userId = user?.user?.id ?? null;

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
