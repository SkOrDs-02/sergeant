import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@shared/api";
import { billingKeys } from "@shared/lib/api/queryKeys";
import { useAuthOptional } from "../auth/AuthContext";
import type { BillingAccess, BillingStatusResponse } from "@sergeant/shared";

/**
 * Web-side billing skeleton (initiative 0010 Phase 4.1).
 *
 * Reads `/api/billing/status` and exposes a tiny `{ plan, isPro, isLoading,
 * subscription }` surface for callsites that gate Pro-only UI (paywall
 * modal, settings page, daily AI limits). The server returns a synthetic
 * row when no subscription exists, so `plan` defaults to `"free"` even
 * when the response is in flight.
 *
 * Invalidation: write paths (`POST /api/billing/checkout` redirect →
 * `/pricing?checkout=success`) explicitly invalidate `billingKeys.status`
 * via `queryClient.invalidateQueries`. Provider webhooks (LiqPay/Plata;
 * Stripe dormant for UA) may also NOTIFY-broadcast `subscriptions.changed`;
 * a listener PR will bridge that to React Query
 * (`docs/work/specs/launch/business/06-monetization-architecture.md`).
 */

export type Plan = "free" | "pro";

export interface UsePlanResult {
  /** `"free"` is the default while loading or unauthenticated. */
  plan: Plan;
  /** True коли сервер каже, що Premium діє: `pro`, `trial` або `grace`. */
  isPro: boolean;
  /** Mirrors `useQuery` loading state — distinct from `plan === "free"`. */
  isLoading: boolean;
  /** Raw subscription payload (id, status, currentPeriodEnd…) for UI hints. */
  subscription: BillingStatusResponse["subscription"] | null;
  /**
   * Знімок доступу від сервера (стан, фічі реєстру, тижневі лічильники).
   * Web нічого не обчислює з плану сам (спека access-tiers): під час trial і
   * grace два місця обчислення розійшлися б. `null` поки запит у польоті.
   */
  access: BillingAccess | null;
}

function selectPlan(data: BillingStatusResponse): Plan {
  return data.access.state === "free" ? "free" : "pro";
}

export function usePlan(): UsePlanResult {
  // FUN-1 (аудит 2026-09): анонімний бут стріляв у `/api/billing/status`
  // і збирав 401 у консоль на кожному маршруті. Без сесії план і так
  // «free» — запит не потрібен. Поза `AuthProvider` (голі юніт-тести)
  // поведінка попередня.
  const auth = useAuthOptional();
  const signedOut = auth?.status === "unauthenticated";
  const query = useQuery({
    queryKey: billingKeys.status,
    queryFn: ({ signal }) => billingApi.status({ signal }),
    enabled: !signedOut,
    // Plan rarely changes — 60 s staleTime is enough to coalesce focus
    // refetches across tabs; webhook-driven invalidation picks up fresh
    // post-checkout state without polling the server.
    staleTime: 60_000,
    // 401s on unauthenticated callers are expected: fall through to "free"
    // instead of bubbling errors into Pro-only UI.
    retry: false,
  });

  const subscription = query.data?.subscription ?? null;
  const plan: Plan = query.data ? selectPlan(query.data) : "free";

  return {
    plan,
    isPro: plan === "pro",
    isLoading: query.isLoading,
    subscription,
    access: query.data?.access ?? null,
  };
}
