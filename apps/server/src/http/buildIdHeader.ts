import type { RequestHandler } from "express";

/**
 * Stack-pulse 2026-05 / PR-21 — short-SHA cascade for the
 * `X-Server-Build-Id` response header. Cascade mirrors
 * `resolveSentryRelease` (`apps/server/src/sentry.ts`) so server-side
 * Sentry releases, the build-id header that the web SW consumes, and
 * source-map upload references all converge on the same identity.
 *
 *   1. `SENTRY_RELEASE`        — explicit override (release-please, custom CI)
 *   2. `RAILWAY_GIT_COMMIT_SHA` — Railway injects per deploy
 *   3. `VERCEL_GIT_COMMIT_SHA`  — Vercel injects per deploy
 *   4. `GITHUB_SHA`             — GitHub Actions fallback
 *   5. `BUILD_ID`               — generic CI / docker-build fallback
 *
 * The value is truncated to a 7-character short SHA (git-default
 * abbreviation length) — anything longer leaks no extra information
 * and inflates response headers. Non-string / empty inputs collapse
 * to `null`, in which case `serverBuildIdMiddleware` does not emit
 * the header at all.
 */
export function resolveServerBuildId(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const candidates = [
    env["SENTRY_RELEASE"],
    env["RAILWAY_GIT_COMMIT_SHA"],
    env["VERCEL_GIT_COMMIT_SHA"],
    env["GITHUB_SHA"],
    env["BUILD_ID"],
  ];
  for (const v of candidates) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (trimmed === "") continue;
    return trimmed.slice(0, 7);
  }
  return null;
}

/**
 * Express middleware that stamps every response with
 * `X-Server-Build-Id: <short-sha>` so the web SW (and any other
 * client) can compare the running server build against the client
 * bundle's `import.meta.env.VITE_BUILD_ID`. A divergence sustained
 * over the configured grace window forces the prompt-mode SW to
 * skip-waiting (see `apps/web/src/sw/autoUpdate.ts`).
 *
 * Behaviour:
 *   - Header value is resolved once at boot via {@link resolveServerBuildId}
 *     and held in closure — environment doesn't change at runtime, so a
 *     per-request resolve would just be a no-op string allocation.
 *   - When the cascade returns `null` (local dev without any SHA set)
 *     we skip the header entirely. The client treats absence as
 *     "unknown server build" → no force-prompt, which is the right
 *     behaviour both for `pnpm dev:server` and for environments where
 *     the operator deliberately wants to opt out.
 *   - The value is a 7-char abbreviation — same length as
 *     `git rev-parse --short HEAD`. It is already exposed in
 *     `index.html` and Sentry events, so adding it here leaks nothing
 *     new.
 *
 * Exposed cross-origin via `apiCorsMiddleware` (`Access-Control-Expose-Headers`),
 * otherwise the Vercel-hosted web bundle cannot read it on
 * Railway-served responses.
 */
export function serverBuildIdMiddleware(
  env: NodeJS.ProcessEnv = process.env,
): RequestHandler {
  const buildId = resolveServerBuildId(env);
  return (_req, res, next) => {
    if (buildId) {
      res.setHeader("X-Server-Build-Id", buildId);
    }
    next();
  };
}
