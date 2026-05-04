/**
 * Mobile analytics sink (Phase 2).
 *
 * Mirrors the web contract in `apps/web/src/core/observability/analytics.ts`:
 *
 *   1. Local `console.log("[analytics]", …)` for dev / Sentry breadcrumbs.
 *      Always on — costs nothing.
 *   2. PostHog HTTP transport (`./../observability/posthog.ts`) — fires
 *      iff `EXPO_PUBLIC_POSTHOG_KEY` is set, otherwise complete no-op.
 *
 * `trackEvent` stays fire-and-forget: any throw inside the PostHog
 * transport is swallowed so call-sites never have to wrap analytics in
 * try/catch.
 */
import { ANALYTICS_EVENTS, type AnalyticsEventName } from "@sergeant/shared";

import { capturePostHogEvent } from "@/observability/posthog";

export { ANALYTICS_EVENTS };
export {
  initPostHog,
  identifyPostHogUser,
  resetPostHog,
} from "@/observability/posthog";

export function trackEvent(
  eventName: AnalyticsEventName | string,
  payload?: object,
) {
  if (!eventName || typeof eventName !== "string") return;
  const safePayload =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  try {
    console.log("[analytics]", {
      eventName,
      payload: safePayload,
      timestamp: new Date().toISOString(),
    });
  } catch {
    /* noop */
  }
  // Separate try/catch so the PostHog transport never breaks the
  // console-log fallback that callers may rely on for local debugging.
  try {
    capturePostHogEvent(eventName, safePayload);
  } catch {
    /* PostHog transport never breaks trackEvent callers */
  }
}
