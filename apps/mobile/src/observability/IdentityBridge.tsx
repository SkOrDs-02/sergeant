/**
 * Watches `useUser()` and forwards login / logout transitions to the
 * PostHog mobile transport so events land on the right `distinct_id`:
 *
 *   - first-render with no user        → no-op (anonymous distinctId
 *                                         minted in `initPostHog`).
 *   - logged-out → logged-in           → `identifyPostHogUser(uid, traits)`.
 *   - user A → user B (rare, e.g. dev) → `identifyPostHogUser(uidB, …)`.
 *   - logged-in → logged-out           → `resetPostHog()`.
 *
 * Mirrors the wiring `apps/web/src/core/auth/AuthContext.tsx` does on
 * the web side. Component renders nothing — it exists only to host the
 * effect that reacts to `useUser()` updates.
 */
import { useEffect, useRef } from "react";

import { useUser } from "@sergeant/api-client/react";

import { buildIdentifyTraits } from "./identifyTraits";
import { identifyPostHogUser, resetPostHog } from "./posthog";

export function IdentityBridge(): null {
  const { data } = useUser({
    // Identical guard rails to `CloudSyncProvider`: avoid retry-storming
    // the API on cold-start before auth is resolved, and skip the
    // "every bring-to-front is a focus" refetch that mobile defaults to.
    retry: false,
    refetchOnWindowFocus: false,
  });
  const lastUserIdRef = useRef<string | null>(null);

  const currentUser = data?.user ?? null;
  const currentUserId = currentUser?.id ?? null;

  useEffect(() => {
    if (currentUserId === lastUserIdRef.current) return;

    if (currentUser && currentUserId) {
      // `IdentifyTraits` is structurally a subset of the looser
      // `Record<string, unknown>` the transport accepts; the cast is
      // safe because all fields of `IdentifyTraits` are
      // JSON-serialisable primitives or arrays of primitives.
      identifyPostHogUser(
        currentUserId,
        buildIdentifyTraits(currentUser) as Record<string, unknown>,
      );
    } else if (lastUserIdRef.current) {
      // Only call reset on actual logout (had a user, now we don't),
      // not on the first render when both refs are `null`.
      resetPostHog();
    }

    lastUserIdRef.current = currentUserId;
  }, [currentUser, currentUserId]);

  return null;
}
