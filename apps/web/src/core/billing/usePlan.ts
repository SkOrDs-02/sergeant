import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@shared/api";
import { billingKeys } from "@shared/lib/api/queryKeys";
import type { BillingStatusResponse } from "@sergeant/shared";
import { useAuth } from "../auth/AuthContext";

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
 * via `queryClient.invalidateQueries`. The Stripe webhook handler also
 * NOTIFY-broadcasts `subscriptions.changed`; a listener PR will bridge
 * that to React Query (`docs/launch/business/06-monetization-architecture.md`).
 */

export type Plan = "free" | "pro";

export interface UsePlanResult {
  /** `"free"` is the default while loading or unauthenticated. */
  plan: Plan;
  /** True only when an active/trialing/past_due subscription is on-file. */
  isPro: boolean;
  /** Mirrors `useQuery` loading state — distinct from `plan === "free"`. */
  isLoading: boolean;
  /** Raw subscription payload (id, status, currentPeriodEnd…) for UI hints. */
  subscription: BillingStatusResponse["subscription"] | null;
}

function selectPlan(data: BillingStatusResponse): Plan {
  // Server contract: BillingPlan is `"plus" | "pro"`; ADR-0051 removed the
  // Plus tier from active scope, so anything non-`null` collapses to "pro".
  return data.subscription.active ? "pro" : "free";
}

export function usePlan(): UsePlanResult {
  const { status } = useAuth();
  const query = useQuery({
    queryKey: billingKeys.status,
    queryFn: ({ signal }) => billingApi.status({ signal }),
    // Only authenticated sessions have a billing row to read. Anonymous /
    // demo visitors are always "free", so skip the request entirely instead
    // of firing it and swallowing the guaranteed 401 — keeps the network
    // panel + console clean and avoids a pointless round-trip. A disabled
    // query stays `isPending` with `isFetching: false`, so `isLoading`
    // (= isPending && isFetching) is `false` and `plan` falls through to
    // the "free" default below.
    enabled: status === "authenticated",
    // Plan rarely changes — 60 s staleTime is enough to coalesce focus
    // refetches across tabs; webhook-driven invalidation picks up fresh
    // post-checkout state without polling the server.
    staleTime: 60_000,
    retry: false,
  });

  const subscription = query.data?.subscription ?? null;
  const plan: Plan = query.data ? selectPlan(query.data) : "free";

  return {
    plan,
    isPro: plan === "pro",
    isLoading: query.isLoading,
    subscription,
  };
}
