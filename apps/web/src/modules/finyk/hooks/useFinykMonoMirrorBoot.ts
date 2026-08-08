/**
 * React hook that boots the SQLite Mono cache mirror.
 *
 * PR #038 of `docs/planning/storage-roadmap.md`. Stage 13 PR #078
 * retired the `feature.finyk.sqlite_v2.mono_mirror` flag — the mirror
 * now boots unconditionally after mount so `useMonobankWebhook` can
 * overlay reads from the local `finyk_mono_*` tables.
 *
 * Fire-and-forget — boot failures fall back to LS silently (console
 * warning only).
 */

import { useEffect, useRef } from "react";
import { useLocalUserId } from "../../../core/auth/useLocalUserId";
import { bootFinykMonoMirror } from "../lib/monoMirrorBoot";
import { notifyFinykMonoMirrorRefresh } from "../lib/monoMirrorGate";

export function useFinykMonoMirrorBoot(): void {
  // `useLocalUserId`, НЕ `useAuth().user?.id`: той самий резолвер, що й у
  // `useFinykSqliteReadBoot`. Демо обходить auth (`user` там `null`), тож
  // на `useAuth` цей бут узагалі не стартував під демо — і демо-місток
  // банківських транзакцій у `monoMirrorBoot.ts` був недосяжним кодом:
  // 23 засіяні транзакції лежали в LS, а мірор, з якого читає продакшн,
  // лишався порожнім (знайдено браузерною верифікацією L-8, 2026-08-08).
  // Для залогінених користувачів резолвер віддає той самий справжній id,
  // тож їхня поведінка не змінюється.
  const userId = useLocalUserId();
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
