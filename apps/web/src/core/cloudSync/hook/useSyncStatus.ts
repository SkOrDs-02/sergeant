import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { useOnlineStatus } from "@shared/hooks/useOnlineStatus";
import { syncKeys } from "@shared/lib/api/queryKeys";

import { SYNC_OUTBOX_CHANGED_EVENT } from "../../syncEngine/outboxChanged";
import { getSyncEngineWriter } from "../../syncEngine/singleton";

/**
 * Lightweight hook that mirrors the v2 op-log writer's outbox counters
 * into React state so `OfflineBanner.tsx` can render a "blocked /
 * syncing / offline" pill without owning the full sync lifecycle.
 *
 * Stage 13 PR #077: `dirtyCount` and `queuedCount` (always `0` since
 * the v1 engine drop in PR #052b) removed from the return shape.
 * `OfflineBanner` now reads `syncV2PendingCount` directly.
 *
 * Polling doctrine (closes audit P2-D —
 * `docs/audits/2026-05-13-web-architecture-state-roast.md`):
 *
 *   - `getStatus()` is wrapped in a React Query so it auto-refetches
 *     every {@link SYNC_STATUS_POLL_MS} — before this hook used
 *     `useState` + `useEffect` and only re-fetched on `online`/`offline`
 *     window events, so an in-session push that filled the outbox left
 *     the pill stale until the next reconnect. Інтервал НЕ гейтиться на
 *     `isOnline`: причина — в AI-DANGER біля самого `refetchInterval`.
 *   - Інтервал — стеля затримки, не основний тригер. Основний —
 *     `SYNC_OUTBOX_CHANGED_EVENT`: аутбокс сам каже, коли його вміст
 *     змінився (новий рядок або завершений тік запису), і лічильник
 *     оновлюється майже одразу, а не «десь протягом 30 с».
 *   - On `online`/`offline` transitions we invalidate the query so
 *     the next read is fresh (`enabled` stays `true`). The invalidation
 *     runs in a `useEffect` with deps `[queryClient]` and is wired
 *     directly to the `window` `online`/`offline` events — not to the
 *     `isOnline` React state value. Coupling the invalidate-effect to
 *     `[isOnline, queryClient]` (as in the original design) re-ran the
 *     effect on mount and on every `isOnline`-driven re-render of
 *     surfaces that also subscribe to `isOnline` (the Welcome route,
 *     `OfflineBanner`), and with `staleTime: 0` + `networkMode: "always"`
 *     the resulting invalidate → refetch → React Query observer notify
 *     → consumer re-render chain could latch into an infinite render
 *     loop on `/welcome` (see PR description). Listening to the window
 *     events directly fires only on the actual transitions, which is
 *     the only thing the invalidate was meant to react to.
 *   - Window focus also triggers a refetch, matching React Query's
 *     defaults — useful for users who keep the tab in the background.
 *   - Hard Rule #2 — the key lives in `syncKeys.status()` factory in
 *     `apps/web/src/shared/lib/api/queryKeys.ts`, not inline.
 */
export const SYNC_STATUS_POLL_MS = 30_000;

/**
 * Вікно склеювання подій `sergeant:sync-outbox-changed`. Імпорт Strong-CSV
 * чи bulk-розмітка дня ставлять у чергу сотні рядків підряд — без цього
 * кожен рядок дав би окремий `invalidate` і окремий COUNT по SQLite.
 */
export const OUTBOX_INVALIDATE_DEBOUNCE_MS = 300;

interface SyncStatusState {
  isOnline: boolean;
  syncV2PendingCount: number;
  syncV2RejectedCount: number;
  syncV2DeadLetterCount: number;
  retrySyncV2DeadLetters: () => Promise<void>;
}

interface SyncStatusCounts {
  readonly pending: number;
  readonly rejected: number;
  readonly dead_letter: number;
}

const EMPTY_COUNTS: SyncStatusCounts = {
  pending: 0,
  rejected: 0,
  dead_letter: 0,
};

async function fetchSyncStatus(): Promise<SyncStatusCounts> {
  const runtime = getSyncEngineWriter();
  if (!runtime) return EMPTY_COUNTS;
  try {
    return await runtime.getStatus();
  } catch {
    // Soft-fail: a missing/locked SQLite shouldn't surface as a hook-level
    // error to `OfflineBanner` — fall back to the empty counters so the
    // pill keeps rendering instead of throwing past the Suspense boundary.
    return EMPTY_COUNTS;
  }
}

const retrySyncV2DeadLetters = async (): Promise<void> => {
  await getSyncEngineWriter()?.recoverAllDeadLetters();
};

export function useSyncStatus(): SyncStatusState {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: syncKeys.status(),
    queryFn: fetchSyncStatus,
    // AI-DANGER: інтервал НЕ гейтиться на `isOnline`. До 2026-09-03
    // гейтився — і лічильник черги завмирав рівно в офлайні, тобто в
    // єдиному стані, коли черга тільки й росте: людина додавала записи,
    // а плашка показувала число, зняте в мить розриву (browser-QA
    // 2026-09-02). Гейт суперечив і сусідньому `networkMode: "always"`
    // нижче, який стоїть тут саме тому, що `getStatus()` читає ЛОКАЛЬНИЙ
    // SQLite і в офлайні потрібен найбільше.
    refetchInterval: SYNC_STATUS_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    // `getStatus()` reads the local SQLite outbox, not the network, so we
    // must opt out of React Query's default `networkMode: "online"` —
    // otherwise the query would be paused exactly when we want the
    // freshest counts (offline / on the `offline` event).
    networkMode: "always",
    staleTime: 0,
  });

  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: syncKeys.status() });
    };
    window.addEventListener("online", invalidate);
    window.addEventListener("offline", invalidate);
    return () => {
      window.removeEventListener("online", invalidate);
      window.removeEventListener("offline", invalidate);
    };
  }, [queryClient]);

  // Свіжий рядок в аутбоксі або завершений тік запису — стан лічильника
  // застарів прямо зараз, а не через 30 с. Без цього плашка
  // «Синхронізація · N в черзі» ще до хвилини висіла після того, як черга
  // насправді спорожніла, бо єдиним джерелом правди був інтервал.
  //
  // Склеювання обовʼязкове: подія летить на КОЖЕН поставлений рядок, а
  // bulk-імпорт ставить їх сотнями.
  useEffect(() => {
    let timer: number | null = null;
    const schedule = () => {
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: syncKeys.status() });
      }, OUTBOX_INVALIDATE_DEBOUNCE_MS);
    };
    window.addEventListener(SYNC_OUTBOX_CHANGED_EVENT, schedule);
    return () => {
      window.removeEventListener(SYNC_OUTBOX_CHANGED_EVENT, schedule);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [queryClient]);

  const counts = data ?? EMPTY_COUNTS;

  // Stabilise the return reference. The query runs with `staleTime: 0` and
  // hands React Query a fresh options object every render, so `OfflineBanner`
  // (and any future consumer) re-renders often; returning a fresh object
  // literal each time would propagate that churn into consumers' dependency
  // arrays and feed the RootLayout cache-tick loop that `useActivationV2Boot`
  // already guards against (see its `event.type` filter). `retrySyncV2DeadLetters`
  // is a module-level constant, so memoising on the three count primitives plus
  // `isOnline` yields a referentially stable object whenever the values are
  // unchanged.
  return useMemo<SyncStatusState>(
    () => ({
      isOnline,
      syncV2PendingCount: counts.pending,
      syncV2RejectedCount: counts.rejected,
      syncV2DeadLetterCount: counts.dead_letter,
      retrySyncV2DeadLetters,
    }),
    [isOnline, counts.pending, counts.rejected, counts.dead_letter],
  );
}
