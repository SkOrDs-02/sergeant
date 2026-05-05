/**
 * OpenClaw GitHub authentication — Phase 1 of GitHub App migration
 * (stack-pulse-2026-05 PR-06).
 *
 * Goal: stop authenticating to GitHub from production code with a plain
 * personal access token (`OPENCLAW_GITHUB_PAT`, with a `Git_PAT` fallback
 * inherited from Devin's VM environment). Move to a GitHub App that mints
 * short-lived (1h) installation-tokens scoped to a single installation.
 *
 * Rollout (per ADR-0042-style two-phase plan):
 *
 *   Phase 1 — **this PR.** Add App-flow alongside PAT-flow, gated by the
 *   feature flag `OPENCLAW_USE_GITHUB_APP`. Default `false` for at least
 *   one week of staging soak. Production behaviour is unchanged unless an
 *   operator explicitly flips the flag.
 *
 *   Phase 2 — follow-up PR (Day 30 of stack-pulse-2026-05). Default flips
 *   to `true`, the PAT-flow is deleted, the `Git_PAT` fallback is removed
 *   from `apps/server/src/env.ts`, and the «no PAT in production»
 *   hard-rule is registered in `docs/governance/hard-rules.json`. Doing
 *   that registration **before** the PAT-flow is gone would lie to the
 *   reader — the rule is only defensible once it is true.
 *
 * Why a custom auth helper instead of `@octokit/auth-app`:
 *
 *   - Zero new runtime dependencies. We already use `fetch` directly in
 *     the rest of `tools.ts` / `write-tools.ts`; staying consistent with
 *     that style means a smaller diff and one less supply-chain surface.
 *   - The exchange we need (App JWT → installation token) is one POST
 *     and ~30 lines of crypto. `@octokit/auth-app` would pull in the
 *     full Octokit core + plugins, which the rest of OpenClaw doesn't
 *     use.
 *   - Explicit caching keeps the hot-path observable: if a token-mint
 *     ever spikes latency, it's right here in our own code, not behind
 *     an Octokit `request` wrapper.
 *
 * If we ever need richer App workflows (multi-installation, OAuth user
 * tokens, etc.), bumping to `@octokit/auth-app` is a tactical follow-up.
 */

import * as crypto from "node:crypto";
import { env } from "../../env.js";
import { logger } from "../../obs/logger.js";

/**
 * Soft refresh-headroom: we treat a cached installation-token as expired
 * 5 minutes before its real expiry. GitHub installation-tokens last 1h
 * (per the docs), so a 5-min buffer means we always issue API calls with
 * ≥55min of validity remaining and never race the upstream-side TTL.
 */
const TOKEN_REFRESH_HEADROOM_MS = 5 * 60 * 1000;

/**
 * Hard-cap on the App JWT lifetime per GitHub's spec ("must be ≤10
 * minutes"). We pick 9 minutes — comfortably under the cap, comfortably
 * above the network-RTT + clock-skew budget.
 */
const APP_JWT_TTL_SECONDS = 9 * 60;

/**
 * Clock-skew compensation. GitHub recommends backdating `iat` by 60s so
 * a slightly-fast Sergeant clock doesn't have GitHub reject the JWT as
 * issued-in-the-future.
 */
const APP_JWT_IAT_BACKDATE_SECONDS = 60;

interface InstallationTokenCacheEntry {
  /** Installation token, opaque to us. Used as `Authorization: Bearer …`. */
  token: string;
  /** Unix-ms epoch when the token expires per GitHub's response. */
  expiresAtMs: number;
}

let cachedInstallationToken: InstallationTokenCacheEntry | null = null;

/**
 * Public clear hook for tests. Production code never calls this.
 */
export function _clearOpenclawGithubAuthCacheForTests(): void {
  cachedInstallationToken = null;
}

/**
 * Inspector hook for tests — never called by production code.
 */
export function _peekOpenclawGithubAuthCacheForTests(): InstallationTokenCacheEntry | null {
  return cachedInstallationToken;
}

export interface OpenclawGithubAuth {
  /** Token to drop into `Authorization: Bearer ${token}`. */
  token: string;
  /**
   * Provenance for logging / error-attribution. `app` = freshly minted
   * (or cached) installation-token from the GitHub App flow. `pat` =
   * legacy Personal Access Token from `env.OPENCLAW_GITHUB_PAT`.
   */
  source: "app" | "pat";
}

/**
 * Returns a GitHub authentication token suitable for the OpenClaw scope
 * (read repo, open PRs/issues, list releases). When the App-flow is
 * enabled and credentials are present, mints (or returns cached)
 * installation-token; otherwise falls back to PAT.
 *
 * If neither flow is configured, returns `null`. Callers MUST handle
 * `null` with the same fail-soft semantics they use today for missing
 * PAT (`status: 'not_configured'`, `note: 'GitHub auth not configured'`,
 * etc.) — we deliberately do NOT throw, because OpenClaw's contract is
 * that missing creds produce an audit-log row rather than a 500.
 */
export async function getOpenclawGithubAuth(): Promise<OpenclawGithubAuth | null> {
  if (env.OPENCLAW_USE_GITHUB_APP && hasAppCredentials()) {
    try {
      const token = await getInstallationToken();
      return { token, source: "app" };
    } catch (err) {
      // App-flow failure must not silently fall through to PAT — that
      // would mask config drift (e.g. expired private key) and let
      // production keep limping on the legacy path indefinitely. Log
      // loud, return null, let the caller surface 'not_configured'.
      logger.error({
        msg: "openclaw_github_app_auth_failed",
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  const pat = env.OPENCLAW_GITHUB_PAT;
  if (pat) {
    return { token: pat, source: "pat" };
  }

  return null;
}

function hasAppCredentials(): boolean {
  return Boolean(
    env.OPENCLAW_GITHUB_APP_ID &&
    env.OPENCLAW_GITHUB_APP_PRIVATE_KEY &&
    env.OPENCLAW_GITHUB_APP_INSTALLATION_ID,
  );
}

async function getInstallationToken(): Promise<string> {
  const now = Date.now();
  if (
    cachedInstallationToken &&
    cachedInstallationToken.expiresAtMs - TOKEN_REFRESH_HEADROOM_MS > now
  ) {
    return cachedInstallationToken.token;
  }

  const jwt = signAppJwt({
    appId: env.OPENCLAW_GITHUB_APP_ID,
    privateKey: env.OPENCLAW_GITHUB_APP_PRIVATE_KEY,
  });

  const installationId = env.OPENCLAW_GITHUB_APP_INSTALLATION_ID;
  const url = `https://api.github.com/app/installations/${encodeURIComponent(
    installationId,
  )}/access_tokens`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "OpenClaw-Bot",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GitHub App installation-token exchange failed: HTTP ${res.status}${
        body ? `: ${body.slice(0, 200)}` : ""
      }`,
    );
  }
  const body = (await res.json()) as { token?: string; expires_at?: string };
  if (!body.token || !body.expires_at) {
    throw new Error(
      "GitHub App installation-token response missing token / expires_at",
    );
  }
  const expiresAtMs = Date.parse(body.expires_at);
  if (!Number.isFinite(expiresAtMs)) {
    throw new Error(
      `GitHub App installation-token expires_at not parseable: ${body.expires_at}`,
    );
  }
  cachedInstallationToken = { token: body.token, expiresAtMs };
  return body.token;
}

/**
 * Sign a GitHub-App JWT (RS256) with the App's private key.
 *
 * Exported for unit-testing — production callers should use
 * `getOpenclawGithubAuth()` so caching + flag-handling stay centralized.
 */
export function signAppJwt(input: {
  appId: string;
  privateKey: string;
  /** Override `Date.now()` — tests only. */
  nowMs?: number;
}): string {
  const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: nowSec - APP_JWT_IAT_BACKDATE_SECONDS,
    exp: nowSec + APP_JWT_TTL_SECONDS,
    iss: input.appId,
  };
  const headerB64 = base64Url(JSON.stringify(header));
  const payloadB64 = base64Url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer
    .sign(normalizePrivateKey(input.privateKey))
    .toString("base64url");
  return `${signingInput}.${signature}`;
}

function base64Url(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64url");
}

/**
 * Some secret-stores (Vercel, Railway, 1Password CLI) flatten newlines
 * in PEM bodies to `\n` literals. Restore them before handing the key
 * to `crypto.createSign` so the parser doesn't reject the PEM.
 */
function normalizePrivateKey(raw: string): string {
  if (raw.includes("\\n") && !raw.includes("\n")) {
    return raw.replace(/\\n/g, "\n");
  }
  return raw;
}
