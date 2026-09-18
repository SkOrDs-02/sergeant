/**
 * Mobile identity wrapper — pairs PostHog identify with Sentry setUser.
 * Replaces the two duplicate bridges:
 *   - apps/mobile/src/features/analytics/AnalyticsIdentityBridge.tsx  (KEEP, but migrate to use this)
 *   - apps/mobile/src/observability/IdentityBridge.tsx                (DELETE — duplicate)
 *
 * Target location: apps/mobile/src/features/analytics/identity.ts
 */
import * as Sentry from "@sentry/react-native";

import {
  identifyPostHogUser,
  resetPostHog,
  setPostHogPersonProperties,
} from "@/lib/observability/posthog";
import type { IdentifyTraits } from "@/lib/observability/identifyTraits";

let lastIdentifiedId: string | null = null;

export function identifyUser(userId: string, traits: IdentifyTraits): void {
  if (!userId) return;
  if (lastIdentifiedId === userId) {
    setPostHogPersonProperties(traits);
    return;
  }
  identifyPostHogUser(userId, traits);
  Sentry.setUser({ id: userId });
  lastIdentifiedId = userId;
}

export function resetIdentity(): void {
  resetPostHog();
  Sentry.setUser(null);
  lastIdentifiedId = null;
}

/** Test-only. */
export function __resetIdentityForTests(): void {
  lastIdentifiedId = null;
}
