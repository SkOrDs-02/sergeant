/**
 * React hook that boots the SQLite Mono cache mirror on mobile.
 *
 * PR #038 of `docs/planning/storage-roadmap.md` (mobile parity for
 * web PR #038). When the `feature.finyk.sqlite_v2.mono_mirror` flag
 * is on, this hook runs `bootFinykMonoMirror()` once after mount so
 * `transactionsStore` can overlay reads from the local
 * `finyk_mono_*` tables instead of relying on the MMKV-only Mono
 * cache for cold-start renders.
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
