/**
 * Sergeant mobile — observability (Sentry RN) bootstrap.
 *
 * Phase 12 scaffold: wires `@sentry/react-native` behind the
 * `EXPO_PUBLIC_SENTRY_DSN` env var so the app remains a clean no-op
 * when the DSN is absent (local dev, forks, PR previews without
 * secrets). No user-PII capture, no HTTP breadcrumbs, no performance
 * tracing — those land in follow-up phases.
 *
 * @see docs/mobile/react-native-migration.md §4 (Phase 12)
 * @see apps/web/src/core/observability/sentry.ts — web-side analogue
 */

import * as Sentry from "@sentry/react-native";

import { getSentryDsn } from "./observability/env";

/** Module-scope flag flipped the first time `initObservability()`
 *  successfully hands a DSN to `Sentry.init`. Used by `captureError`
 *  to pick between the real `captureException` tap and the
 *  `console.error` fallback. */
let initialized = false;

/**
 * Initialises Sentry RN iff `EXPO_PUBLIC_SENTRY_DSN` is set.
 *
 * Must be called exactly once, from a `useEffect` at the root of the
 * Expo Router tree (see `apps/mobile/app/_layout.tsx`). No side effects
 * at import time — tests can `jest.resetModules()` cleanly.
 */
export function initObservability(): void {
  if (initialized) return;
  const dsn = getSentryDsn();
  if (!dsn) {
    console.log("[observability] sentry disabled (no DSN)");
    return;
  }
  Sentry.init({
    dsn,
    enableAutoSessionTracking: true,
    // 5% of transactions — enough for p95/p99 latency visibility without
    // significant overhead. Bump to 0.1 if mobile APM data is sparse in prod.
    tracesSampleRate: __DEV__ ? 0 : 0.05,
    debug: __DEV__,
  });
  initialized = true;
}

/**
 * Forwards `error` to `Sentry.captureException` when Sentry is
 * initialised, otherwise logs to `console.error` so the diagnostic
 * never silently disappears. Safe to call from error boundaries —
 * never throws.
 */
export function captureError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (initialized) {
    try {
      Sentry.captureException(error, { extra: context });
      return;
    } catch {
      // Sentry must never break the host app — fall through to
      // console.error so we at least get a local trace.
    }
  }
  console.error("[observability] captureError", error, context);
}

/** Test-only reset. Exported from a `__test__` prefix so it's obvious
 *  at call-sites that this is not for production use. */
export function __resetObservabilityForTests(): void {
  initialized = false;
}
