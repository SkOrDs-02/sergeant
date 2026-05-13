/**
 * Sentry SDK init for the console process.
 *
 * Mirrors the server pattern (`apps/server/src/sentry.ts`): import this
 * module as the very first import in `index.ts` so the SDK instruments
 * Node builtins before any other module loads.
 *
 * DSN comes from `SENTRY_DSN` env-var. When absent the SDK stays inert
 * (no-ops all calls) — local dev never needs a DSN.
 */

import * as Sentry from "@sentry/node";

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
  });
}

export { Sentry };
