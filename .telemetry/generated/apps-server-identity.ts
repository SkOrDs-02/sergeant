/**
 * Server-side identity helpers — pair PostHog person-property updates
 * with Sentry user context. Use for Stripe webhook (plan flip) and any
 * other server-side trait change that must reach PostHog immediately.
 *
 * `setUserContext` mirrors the existing Sentry.setUser call at
 * apps/server/src/auth.ts:517 — extract it here so request handlers and
 * webhook handlers share one entry point.
 *
 * Target location: apps/server/src/lib/identity.ts
 */
import * as Sentry from "@sentry/node";

import { posthogCapture } from "./posthogCapture";

export function setUserContext(userId: string): void {
  if (!userId) return;
  Sentry.getCurrentScope?.().setUser({ id: userId });
}

export async function setUserTraits(
  userId: string,
  traits: Record<string, unknown>,
): Promise<void> {
  if (!userId) return;
  await posthogCapture({
    distinctId: userId,
    event: "$identify",
    properties: { $set: traits },
  });
}

export function clearUserContext(): void {
  Sentry.getCurrentScope?.().setUser(null);
}
