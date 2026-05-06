/**
 * OpenClaw GitHub authentication — GitHub App auth-flow (stack-pulse-2026-05
 * PR-06, Phase 2: now the only flow).
 *
 * Goal: never authenticate to GitHub from production with a long-lived
 * personal access token. The App-flow mints short-lived (1h) installation
 * tokens scoped to a single installation, with cache + auto-refresh
 * 5 minutes before expiry. The legacy PAT-flow (`OPENCLAW_GITHUB_PAT` and
 * its `Git_PAT` fallback) was removed in Phase 2 together with the «no
 * PAT in production» Hard Rule #20 in `docs/governance/hard-rules.json` —
 * `assertStartupEnv()` in `apps/server/src/env/env.ts` now refuses to
 * boot the server in production if `OPENCLAW_GITHUB_PAT` or `Git_PAT` is
 * still present in `process.env`.
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
   * Provenance for logging / error-attribution. Always `"app"` since
   * Phase 2 — kept as a literal type instead of a plain string so any
   * call site that grew a `if (auth.source === "pat")` branch during
   * the migration window now fails the type-check loud.
   */
  source: "app";
}

/**
 * Returns a GitHub authentication token suitable for the OpenClaw scope
 * (read repo, open PRs/issues, list releases). Mints (or returns cached)
 * an installation-token via the GitHub App-flow.
 *
 * Returns `null` when the App-flow is disabled (`OPENCLAW_USE_GITHUB_APP=false`,
 * supported only in `NODE_ENV=development`), when App credentials are
 * incomplete, or when the App-flow fetch fails. Callers MUST handle
 * `null` with the same fail-soft semantics they use today
 * (`status: 'not_configured'`, `note: 'GitHub auth not configured'`,
 * etc.) — we deliberately do NOT throw, because OpenClaw's contract is
 * that missing creds produce an audit-log row rather than a 500.
 */
export async function getOpenclawGithubAuth(): Promise<OpenclawGithubAuth | null> {
  if (!env.OPENCLAW_USE_GITHUB_APP) {
    return null;
  }
  if (!hasAppCredentials()) {
    return null;
  }
  try {
    const token = await getInstallationToken();
    return { token, source: "app" };
  } catch (err) {
    // App-flow failure must not silently fall through — we used to fall
    // back to a long-lived PAT here, which masked config drift (e.g.
    // expired private key) and let production keep limping on the
    // legacy path indefinitely. Phase 2 removed the PAT-flow entirely;
    // log loud, return null, let the caller surface 'not_configured'.
    logger.error({
      msg: "openclaw_github_app_auth_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
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
