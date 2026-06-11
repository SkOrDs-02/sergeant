import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { monoWebhookApi, billingApi, pushApi } from "@shared/api";
import { finykKeys, billingKeys, pushKeys } from "@shared/lib/api/queryKeys";
import { shouldPrefetchOnConnection } from "./connectionGate";
import type { HubModuleId } from "../hooks/useHubNavigation";

const STALE_TIME = 30_000;

/**
 * Route-loader pattern for the Sergeant hub-FSM router (initiative 0006
 * Phase 5). Because `apps/web` uses a single catch-all `path: "*"` route
 * (see `core/app/router.tsx`), React Router's `loader` property cannot be
 * applied per-module. This hook replicates the intent: when `activeModule`
 * changes (i.e. the user navigates to a module), fire-and-forget
 * `prefetchQuery` calls warm the React Query cache so the first render of
 * the module can read from cache rather than waiting for in-flight fetches.
 *
 * Prefetch is fire-and-forget — we explicitly do NOT await, so navigation
 * is never blocked. Bandwidth respect: all prefetches are gated on
 * {@link shouldPrefetchOnConnection} (Save-Data + 2G/slow-2G skip).
 *
 * Per-module strategy:
 *  • finyk     — monoSyncState (webhook connection status, needed immediately
 *                for the connected/disconnected UI branch) and billing status
 *                (gates Pro-only analytics features).
 *  • fizruk    — billing status (gates Pro workout history) and VAPID key
 *                (needed to register push notifications for workout reminders).
 *  • nutrition — billing status (gates Pro meal tracking) and VAPID key
 *                (needed for meal reminder push notifications).
 *  • routine   — billing status (gates Pro routine features) and VAPID key
 *                (needed for routine reminder push notifications).
 */
export function useModuleRouteLoader(activeModule: HubModuleId | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!activeModule) return;
    if (!shouldPrefetchOnConnection()) return;

    // Billing status is relevant for all modules — gates Pro UI. Prefetch
    // once; RQ deduplicates subsequent calls within staleTime.
    void queryClient.prefetchQuery({
      queryKey: billingKeys.status,
      queryFn: ({ signal }) => billingApi.status({ signal }),
      staleTime: STALE_TIME,
    });

    // VAPID public key — needed to register push notification subscriptions
    // for workout / meal / routine reminders. Small payload; prefetch eagerly
    // on any module navigation so the reminder opt-in dialog appears
    // immediately without a round-trip.
    void queryClient.prefetchQuery({
      queryKey: pushKeys.vapid,
      queryFn: () => pushApi.getVapidPublic(),
      staleTime: STALE_TIME,
      // Fire-and-forget warm-up: якщо сервер без VAPID env віддає 503,
      // ретраї тут — лише консольний шум; наступна навігація все одно
      // спробує знову (staleTime 30s).
      retry: false,
    });

    if (activeModule === "finyk") {
      // Monobank webhook sync state determines whether the user is connected
      // and whether Finyk shows the "connect" CTA or the transaction list.
      // Warm this before the module chunk even finishes loading so the first
      // render branches correctly instead of showing a skeleton.
      void queryClient.prefetchQuery({
        queryKey: finykKeys.monoSyncState,
        queryFn: ({ signal }) => monoWebhookApi.syncState({ signal }),
        staleTime: STALE_TIME,
      });
    }
  }, [activeModule, queryClient]);
}
