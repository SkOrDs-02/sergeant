/**
 * Canonical identity wrapper — pairs PostHog `identify` with
 * `Sentry.setUser` so distinct_id and Sentry user.id stay aligned.
 *
 * Feature modules MUST import from here, not from `./posthog` directly.
 * The lower-level `identifyPostHogUser` / `resetPostHog` exports remain
 * for the wrapper's own use.
 *
 * Drives the observability-coupling requirement from
 * `.telemetry/tracking-plan.yaml` (`observability_coupling.sentry_posthog_user_link`).
 *
 * Target location: apps/web/src/core/observability/identity.ts
 */
import * as Sentry from "@sentry/react";

import { identifyPostHogUser, resetPostHog } from "./posthog";
import type { IdentifyTraits } from "./identifyTraits";

let lastIdentifiedId: string | null = null;

export function identifyUser(userId: string, traits: IdentifyTraits): void {
  if (!userId) return;
  if (lastIdentifiedId === userId) {
    setPersonProperties(traits);
    return;
  }
  identifyPostHogUser(userId, traits);
  Sentry.setUser({ id: userId });
  lastIdentifiedId = userId;
}

export function setPersonProperties(traits: Partial<IdentifyTraits>): void {
  if (typeof window === "undefined") return;
  void import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.setPersonProperties(traits);
    })
    .catch(() => {
      /* fire-and-forget — telemetry never throws into product code */
    });
}

export function resetIdentity(): void {
  resetPostHog();
  Sentry.setUser(null);
  lastIdentifiedId = null;
}

/** Test-only: reset module-scope state between specs. */
export function __resetIdentityForTests(): void {
  lastIdentifiedId = null;
}
