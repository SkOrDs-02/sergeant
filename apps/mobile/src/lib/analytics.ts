/**
 * Mobile analytics sink.
 *
 * Подвійний transport — той самий контракт, що й у
 * `apps/web/src/core/observability/analytics.ts`:
 *
 *   1. `console.log("[analytics]", …)` — devtools і Sentry breadcrumbs.
 *      Працює завжди.
 *   2. PostHog — якщо виставлений `EXPO_PUBLIC_POSTHOG_KEY`. Транспорт
 *      живе у `./observability/posthog.ts`; події fire-and-forget,
 *      буферизуються до завершення `initPostHog()`.
 */
import { ANALYTICS_EVENTS, type AnalyticsEventName } from "@sergeant/shared";

import { capturePostHogEvent } from "./observability/posthog";

export { ANALYTICS_EVENTS };
export {
  initPostHog,
  identifyPostHogUser,
  resetPostHog,
} from "./observability/posthog";

export function trackEvent(
  eventName: AnalyticsEventName | string,
  payload?: object,
) {
  if (!eventName || typeof eventName !== "string") return;
  const safePayload =
    payload && typeof payload === "object" ? (payload as object) : {};
  try {
    console.log("[analytics]", {
      eventName,
      payload: safePayload,
      timestamp: new Date().toISOString(),
    });
  } catch {
    /* noop */
  }
  // Окремий try/catch — `trackEvent` контракт каже "ніколи не кидає"
  // (див. шапку файлу). Транспорт сам по собі захищений від throw,
  // але `import.meta.env`-style edge-кейси у jest-середовищі краще
  // відсікати ще на верхньому рівні.
  try {
    capturePostHogEvent(eventName, safePayload as Record<string, unknown>);
  } catch {
    /* PostHog transport never breaks trackEvent callers */
  }
}
