/**
 * Sentry SDK init for the console process.
 *
 * Mirrors the server pattern (`apps/server/src/sentry.ts`): import this
 * module as the very first import in `index.ts` so the SDK instruments
 * Node builtins before any other module loads.
 *
 * DSN comes from `SENTRY_DSN` env-var. When absent the SDK stays inert
 * (no-ops all calls) — local dev never needs a DSN.
 *
 * PII handling (parity with `apps/server/src/sentry.ts`, audit
 * `docs/security/pii-handling.md`): we always set `sendDefaultPii: false`
 * and run a `beforeSend` hook that strips `request.data` / `cookies`,
 * recursively scrubs `extra` / `contexts` / `breadcrumbs.data` against
 * the shared `REDACT_KEY_NAMES`, and pattern-scrubs `event.message` +
 * `exception.values[].value` for embedded emails / telegram tokens /
 * JWT / AWS access keys. OpenClaw runtime handles Telegram bot tokens
 * end-to-end, so leaving the default config would risk full-token leak
 * via `console.error("send failed", JSON.stringify(resp))` style traces.
 */

import * as Sentry from "@sentry/node";
import {
  scrubPII,
  scrubPIIString,
  redactSensitiveQueryParams,
} from "@sergeant/shared/lib/pii";

const dsn = process.env["SENTRY_DSN"];

function resolveSentryRelease(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const candidates = [
    env["SENTRY_RELEASE"],
    env["RAILWAY_GIT_COMMIT_SHA"],
    env["GITHUB_SHA"],
  ];
  for (const v of candidates) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return undefined;
}

/**
 * Pure beforeSend hook — exported as a named function (rather than an
 * inline closure) so tests can call it directly without bootstrapping
 * the Sentry SDK. Mirrors `apps/server/src/sentry.ts:applyBeforeSend`
 * but drops the ALS-derived user-id injection (OpenClaw has its own
 * `requestContext` ALS in `tools/openclaw/src/obs/requestContext.ts` —
 * tagging is wired separately via `Sentry.withScope` at capture sites).
 */
export function applyOpenclawBeforeSend<E extends Sentry.ErrorEvent>(
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
  if (event.breadcrumbs) {
    for (const bc of event.breadcrumbs) {
      if (bc.data) scrubPII(bc.data);
      if (typeof bc.message === "string") {
        bc.message = scrubPIIString(bc.message);
      }
    }
  }
  if (event.user) {
    const safe: { id?: string | number; ip_address?: string } = {};
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

/**
 * URL substrings that suppress event capture. Parity with
 * `SENTRY_DENY_URLS` in `apps/server/src/sentry.ts`. OpenClaw is
 * almost entirely outbound (Telegram, server-API, GitHub) but a
 * future health-probe surface is on the roadmap — pre-arming the
 * list keeps the SDK config close to server.
 */
export const OPENCLAW_SENTRY_DENY_URLS: readonly (string | RegExp)[] = [
  "/api/health",
  "/health",
];

if (dsn) {
  const release = resolveSentryRelease();
  Sentry.init({
    dsn,
    environment:
      process.env["SENTRY_ENVIRONMENT"] ||
      process.env["NODE_ENV"] ||
      "development",
    ...(release ? { release } : {}),
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    denyUrls: [...OPENCLAW_SENTRY_DENY_URLS],
    beforeSend: applyOpenclawBeforeSend,
  });
}

export { Sentry };
