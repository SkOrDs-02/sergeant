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
import {
  scrubPII,
  scrubPIIString,
  redactSensitiveQueryParams,
} from "@sergeant/shared";

import { getSentryDsn } from "./observability/env";

/**
 * Minimal structural subset of `Sentry.ErrorEvent` so the
 * `beforeSend` hook stays unit-testable without bootstrapping the RN
 * SDK runtime. Mirrors `WebBeforeSendEvent` in
 * `apps/web/src/core/observability/sentry.ts`.
 */
export interface MobileBeforeSendEvent {
  request?: {
    cookies?: unknown;
    data?: unknown;
    headers?: unknown;
    url?: unknown;
  };
  extra?: unknown;
  contexts?: unknown;
  message?: unknown;
  exception?: {
    values?: Array<{ value?: unknown }>;
  };
  breadcrumbs?: Array<{ data?: unknown; message?: unknown }>;
  user?: {
    id?: string | number;
    ip_address?: string;
  };
}

/**
 * Mobile counterpart of `applyBeforeSend` (`apps/server/src/sentry.ts`)
 * and `applyWebBeforeSend` (`apps/web/src/core/observability/sentry.ts`).
 *
 * Why mobile needs its own hook: the React Native SDK auto-instruments
 * `fetch` / `XMLHttpRequest` breadcrumbs with response bodies that
 * occasionally carry Better Auth session tokens or magic-link OTPs.
 * Pre-2026-05-13 the mobile init was `Sentry.init({ dsn, tracesSampleRate })`
 * — i.e. the upstream default `sendDefaultPii: true` and no scrubber —
 * so anything in `event.request.data` / `headers` / breadcrumb-data
 * went straight to ingest. This hook closes that gap with the same
 * shared `scrubPII` + `scrubPIIString` used by server / web.
 */
export function applyMobileBeforeSend<E extends MobileBeforeSendEvent>(
  event: E,
): E {
  if (event.request?.data) delete event.request.data;
  if (event.request?.cookies) delete event.request.cookies;
  if (event.request?.headers) scrubPII(event.request.headers);
  if (typeof event.request?.url === "string") {
    event.request.url = redactSensitiveQueryParams(event.request.url);
  }
  if (event.extra) scrubPII(event.extra);
  if (event.contexts) scrubPII(event.contexts);
  if (typeof event.message === "string") {
    event.message = scrubPIIString(event.message);
  }
  const exceptionValues = event.exception?.values;
  if (Array.isArray(exceptionValues)) {
    for (const ex of exceptionValues) {
      if (ex && typeof ex.value === "string") {
        ex.value = scrubPIIString(ex.value);
      }
    }
  }
  if (Array.isArray(event.breadcrumbs)) {
    for (const bc of event.breadcrumbs) {
      if (bc && bc.data) scrubPII(bc.data);
      if (bc && typeof bc.message === "string") {
        bc.message = scrubPIIString(bc.message);
      }
    }
  }
  if (event.user) {
    const safe: { id?: string | number } = {};
    if (
      typeof event.user.id === "string" ||
      typeof event.user.id === "number"
    ) {
      safe.id = event.user.id;
    }
    event.user = safe;
  }
  return event;
}

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
    // PII handling (parity with server / web — audit
    // `docs/security/pii-handling.md`): never let the SDK ship raw
    // request bodies / headers / breadcrumb data to ingest. The hook is
    // exported so unit tests run it against synthetic events.
    sendDefaultPii: false,
    beforeSend(event) {
      return applyMobileBeforeSend(event);
    },
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

/**
 * Lazy-forward `Sentry.addBreadcrumb`. No-op when the SDK is not yet
 * initialised — mirrors the web `addSentryBreadcrumb` helper so the
 * sync v2 writer runtime can wire telemetry breadcrumbs (`sync.v2.push`
 * tick complete / skipped) symmetrically across platforms.
 */
export function addSentryBreadcrumb(
  breadcrumb: Parameters<typeof Sentry.addBreadcrumb>[0],
): void {
  if (!initialized) return;
  try {
    Sentry.addBreadcrumb(breadcrumb);
  } catch {
    // Observer faults must never break the host app.
  }
}

/** Test-only reset. Exported from a `__test__` prefix so it's obvious
 *  at call-sites that this is not for production use. */
export function __resetObservabilityForTests(): void {
  initialized = false;
}
