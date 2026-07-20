/**
 * Single source of truth for the Sentry `release` tag, shared across every
 * SDK in the monorepo (server, web, mobile/console). Lives in
 * `@sergeant/shared` because the same release string must be produced
 * identically by packages that do not share a runtime — otherwise Sentry
 * dedupes the same deploy into multiple "releases", one per origin/SDK, and
 * incident attribution + source-map lookup drift apart.
 *
 * The release name is **origin-agnostic**: `sergeant@<short-sha>`. The
 * `sergeant@` prefix is the constant project name — deliberately NOT derived
 * from the deploy host or domain (e.g. `fizruk.vercel.app` vs
 * `sergeant.vercel.app`). Encoding the domain into the release was the root
 * cause of the double release growth tracked in stack-pulse PR-25 (archived:
 * `docs/90-work/initiatives/stack-pulse-2026-05/archive/pr-25-two-production-origins.md`).
 *
 * The SHA is resolved from the first non-empty deploy-host variable, then
 * shortened to 7 chars (git's canonical abbreviation) so the release reads
 * the same as a `git log --oneline` line for the deployed commit.
 *
 * Contract:
 *   - `resolveReleaseSha(env)` — bare git SHA from the deploy environment,
 *     or `undefined` when none is set (so Sentry's own `release: undefined`
 *     semantics surface the misconfiguration instead of masking it).
 *   - `formatRelease(sha)` — wraps a SHA into the `sergeant@<short-sha>`
 *     form. Returns `undefined` for an absent SHA so callers can spread it
 *     conditionally into `Sentry.init`.
 *   - `resolveSentryRelease(env)` — convenience composition of the two.
 *
 * The module is intentionally dependency-free and DOM-free so it imports
 * cleanly into the browser bundle, the Node server, and the console process.
 */

const RELEASE_PREFIX = "sergeant";

/**
 * Deploy-host env-vars in priority order:
 *   1. `SENTRY_RELEASE`         — explicit override (release-please, custom CI)
 *   2. `RAILWAY_GIT_COMMIT_SHA` — Railway auto-injects this per deploy
 *   3. `VERCEL_GIT_COMMIT_SHA`  — Vercel auto-injects this per deploy
 *   4. `GITHUB_SHA`             — fallback when running in GitHub Actions
 *                                 (mobile-shell builds, container scans, etc.)
 */
const SHA_ENV_KEYS = [
  "SENTRY_RELEASE",
  "RAILWAY_GIT_COMMIT_SHA",
  "VERCEL_GIT_COMMIT_SHA",
  "GITHUB_SHA",
] as const;

const SHORT_SHA_LENGTH = 7;

type ReleaseEnv = Record<string, string | undefined>;

/**
 * Runtime-agnostic handle to the ambient env bag. Read through `globalThis`
 * (never a bare `process` reference) so the module typechecks and runs
 * unchanged in node, the browser bundle, and the RN/Capacitor shell — none
 * of which share `@types/node`. Absent `process` (browser/RN) → empty bag,
 * which `resolveReleaseSha` already treats as "no SHA set".
 */
const DEFAULT_ENV: ReleaseEnv =
  (globalThis as { process?: { env?: ReleaseEnv } }).process?.env ?? {};

/**
 * Resolve the deployed git SHA from the deploy environment. Trims whitespace
 * and skips empty / whitespace-only values. Returns `undefined` when no
 * candidate is set.
 */
export function resolveReleaseSha(
  env: ReleaseEnv = DEFAULT_ENV,
): string | undefined {
  for (const key of SHA_ENV_KEYS) {
    const value = env[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return undefined;
}

/**
 * Wrap a git SHA into the origin-agnostic `sergeant@<short-sha>` release
 * name. A SHA that already carries the `sergeant@` prefix (e.g. an explicit
 * `SENTRY_RELEASE` override) is returned unchanged so custom CI release names
 * survive. Returns `undefined` for an absent SHA.
 */
export function formatRelease(sha: string | undefined): string | undefined {
  if (sha == null) return undefined;
  const trimmed = sha.trim();
  if (trimmed === "") return undefined;
  if (trimmed.startsWith(`${RELEASE_PREFIX}@`)) return trimmed;
  return `${RELEASE_PREFIX}@${trimmed.slice(0, SHORT_SHA_LENGTH)}`;
}

/**
 * Resolve the canonical Sentry release tag (`sergeant@<short-sha>`) for the
 * current deploy environment, or `undefined` when no SHA is available.
 */
export function resolveSentryRelease(
  env: ReleaseEnv = DEFAULT_ENV,
): string | undefined {
  return formatRelease(resolveReleaseSha(env));
}
