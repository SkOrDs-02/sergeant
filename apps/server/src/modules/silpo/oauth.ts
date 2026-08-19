import crypto from "node:crypto";
import { z } from "zod";
import { env } from "../../env/env.js";
import { query as defaultQuery } from "../../db.js";
import { logger } from "../../obs/logger.js";
import { recordExternalHttp } from "../../lib/externalHttp.js";
import { elapsedMs } from "../../lib/timing.js";

/**
 * OAuth 2.1 + PKCE (S256) + Dynamic Client Registration client for Silpo
 * MCP. Spec: `docs/90-work/planning/specs/silpo-mcp-integration.md` §
 * Рішення дизайну ("OAuth за mono-патерном, не через Better Auth social" —
 * this is authorization to a third-party API, not a Sergeant login).
 *
 * Звірено живим спайком §0 (2026-08-18): metadata discovery повертає всі
 * три endpoints (`/authorize`, `/token`, `/register`), S256 підтримано,
 * `token_endpoint_auth_methods_supported` містить `none` (public client),
 * DCR приймає localhost-redirect і повертає `client_id` без secret;
 * повний OAuth-флоу з PKCE пройдено, access-токен живе ~30 днів.
 * `scopes_supported` сервер НЕ декларує — {@link SILPO_OAUTH_SCOPE} нижче
 * сервер мовчки приймає. Every zod schema here stays `.passthrough()`.
 */

const PENDING_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — enough for a human OAuth round-trip
const OAUTH_HTTP_TIMEOUT_MS = 15_000;

/**
 * Scope requested at authorize-time. Сервер не публікує `scopes_supported`
 * і мовчки приймає цей рядок (спайк §0, 2026-08-18) — фактичну авторизацію
 * визначає сам грант, живий флоу дав доступ до всіх потрібних tools.
 */
const SILPO_OAUTH_SCOPE = "orders profile";

// ─────────────────────────── Metadata discovery ────────────────────────────

const OAuthMetadataSchema = z
  .object({
    authorization_endpoint: z.string().min(1),
    token_endpoint: z.string().min(1),
    registration_endpoint: z.string().min(1).optional(),
  })
  .passthrough();
export type SilpoOAuthMetadata = z.infer<typeof OAuthMetadataSchema>;

let cachedMetadata: { value: SilpoOAuthMetadata; expiresAt: number } | null =
  null;
const METADATA_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function mcpOrigin(): string {
  return new URL(env.SILPO_MCP_URL).origin;
}

/**
 * Fetches `/.well-known/oauth-authorization-server` relative to the MCP
 * host's origin (RFC 8414). Cached in-process for an hour — this is
 * near-static server metadata, not per-request state.
 */
export async function discoverOAuthMetadata(
  opts: { forceRefresh?: boolean } = {},
): Promise<SilpoOAuthMetadata> {
  if (
    !opts.forceRefresh &&
    cachedMetadata &&
    cachedMetadata.expiresAt > Date.now()
  ) {
    return cachedMetadata.value;
  }

  const url = `${mcpOrigin()}/.well-known/oauth-authorization-server`;
  const start = process.hrtime.bigint();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), OAUTH_HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const ms = elapsedMs(start);
    if (!res.ok) {
      recordExternalHttp("silpo", "error", ms);
      throw new Error(
        `Silpo OAuth metadata discovery failed: HTTP ${res.status}`,
      );
    }
    const json: unknown = await res.json();
    const parsed = OAuthMetadataSchema.parse(json);
    recordExternalHttp("silpo", "ok", ms);
    cachedMetadata = {
      value: parsed,
      expiresAt: Date.now() + METADATA_CACHE_TTL_MS,
    };
    return parsed;
  } catch (err) {
    const ms = elapsedMs(start);
    recordExternalHttp("silpo", "error", ms);
    logger.warn({
      msg: "silpo_oauth_metadata_discovery_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    clearTimeout(t);
  }
}

/** Test-only: clear the in-process metadata cache between unit tests. */
export function __silpoOAuthTestHooks(): {
  clearMetadataCache(): void;
} {
  return {
    clearMetadataCache(): void {
      cachedMetadata = null;
    },
  };
}

// ────────────────────────────────── PKCE ────────────────────────────────────

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

/** RFC 7636 S256 PKCE pair. `codeVerifier` is 43–128 chars per spec (we emit 43). */
export function generatePkcePair(): PkcePair {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(
    crypto.createHash("sha256").update(codeVerifier).digest(),
  );
  return { codeVerifier, codeChallenge };
}

// ───────────────────────── Durable pending-state store ─────────────────────
//
// The OAuth round-trip is a browser top-level redirect through Silpo's
// authorization server and back — `code_verifier` must survive that hop,
// which is minutes of wall-clock with a human in the loop. Better Auth's
// own social-login flow solves this with a signed cookie; a cookie can't
// give us one-time consumption, and one-time consumption is the whole
// point of `state` (replay protection on the callback). So the mapping
// lives in Postgres (`silpo_oauth_state`, migration 124), consumed with a
// single atomic `DELETE ... RETURNING`.
//
// This used to be an in-process `Map`. It cost a restart-shaped bug: any
// redeploy inside the authorization window stranded the user on
// `invalid_state`, and the API could never run more than one replica
// behind a non-sticky balancer. Migration 124's comment carries the full
// rationale, including why `code_verifier` is stored in plaintext.

export interface PendingState {
  userId: string;
  codeVerifier: string;
  redirectUri: string;
}

type PendingStateRow = {
  user_id: string;
  code_verifier: string;
  redirect_uri: string;
};

/** Injectable for unit tests; defaults to the shared pool query. */
export type OAuthQueryFn = typeof defaultQuery;

/** Best-effort GC of rows nobody will ever consume. Never throws. */
async function sweepExpiredStates(queryFn: OAuthQueryFn): Promise<void> {
  try {
    await queryFn(
      `DELETE FROM silpo_oauth_state
        WHERE created_at < NOW() - ($1::bigint * INTERVAL '1 millisecond')`,
      [PENDING_STATE_TTL_MS],
      { op: "silpo_oauth_state_sweep" },
    );
  } catch (err) {
    // Прибирання — не частина контракту `connect`: протухлий рядок і так
    // ніколи не спрацює (TTL-фільтр стоїть у самому consume).
    logger.warn({
      msg: "silpo_oauth_state_sweep_failed",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface AuthorizationUrlResult {
  url: string;
  state: string;
}

/**
 * Builds the `authorization_endpoint` redirect URL for `GET /api/silpo/
 * connect` and stashes `{userId, codeVerifier}` under a fresh `state`
 * nonce for `consumeAuthorizationState` to retrieve at `/callback`.
 */
export async function buildAuthorizationUrl(opts: {
  userId: string;
  redirectUri: string;
  query?: OAuthQueryFn;
}): Promise<AuthorizationUrlResult> {
  const queryFn = opts.query ?? defaultQuery;
  await sweepExpiredStates(queryFn);
  const metadata = await discoverOAuthMetadata();
  const { codeVerifier, codeChallenge } = generatePkcePair();
  const state = base64url(crypto.randomBytes(24));

  if (!env.SILPO_OAUTH_CLIENT_ID) {
    throw new Error(
      "SILPO_OAUTH_CLIENT_ID is not configured — cannot build the Silpo authorization URL",
    );
  }

  // Пишемо стан ПЕРЕД тим, як віддати редірект: якщо INSERT упав, краще
  // показати помилку зараз, ніж відпустити людину в OAuth, з якого вона
  // гарантовано повернеться в `invalid_state`.
  await queryFn(
    `INSERT INTO silpo_oauth_state (state, user_id, code_verifier, redirect_uri)
     VALUES ($1, $2, $3, $4)`,
    [state, opts.userId, codeVerifier, opts.redirectUri],
    { op: "silpo_oauth_state_insert" },
  );

  const url = new URL(metadata.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.SILPO_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("scope", SILPO_OAUTH_SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return { url: url.toString(), state };
}

/**
 * One-time lookup+delete of a pending `state`. Lookup, TTL check and
 * consumption are ONE statement, so two callbacks racing on the same
 * `state` can never both succeed. Returns `null` when the state is
 * unknown/expired/already consumed — callers (routes/silpo.ts) MUST treat
 * that as a hard failure (invalid/replayed callback), never a silent
 * no-op.
 */
export async function consumeAuthorizationState(
  state: string,
  queryFn: OAuthQueryFn = defaultQuery,
): Promise<PendingState | null> {
  const { rows } = await queryFn<PendingStateRow>(
    `DELETE FROM silpo_oauth_state
      WHERE state = $1
        AND created_at >= NOW() - ($2::bigint * INTERVAL '1 millisecond')
      RETURNING user_id, code_verifier, redirect_uri`,
    [state, PENDING_STATE_TTL_MS],
    { op: "silpo_oauth_state_consume" },
  );
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    codeVerifier: row.code_verifier,
    redirectUri: row.redirect_uri,
  };
}

// ────────────────────────────── Token exchange ──────────────────────────────

const TokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    // Refresh grants MAY omit `refresh_token` (server-implicit "reuse the
    // one you already have") — caller must fall back to the prior value.
    refresh_token: z.string().min(1).optional(),
    expires_in: z.number().optional(),
    token_type: z.string().optional(),
  })
  .passthrough();
export type SilpoTokenResponse = z.infer<typeof TokenResponseSchema>;

async function postTokenRequest(
  params: Record<string, string>,
  outcomeLabel: string,
): Promise<SilpoTokenResponse> {
  const metadata = await discoverOAuthMetadata();
  const start = process.hrtime.bigint();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), OAUTH_HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(metadata.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      signal: controller.signal,
    });
    const ms = elapsedMs(start);
    if (!res.ok) {
      recordExternalHttp("silpo", `${outcomeLabel}_error`, ms);
      const bodyText = await res.text().catch(() => "");
      logger.warn({
        msg: "silpo_oauth_token_request_failed",
        outcome: outcomeLabel,
        status: res.status,
        // Never log the request body (contains code/refresh_token/client_id) —
        // only the upstream error body, truncated (Hard Rule #21).
        upstreamBody: bodyText.slice(0, 200),
      });
      throw new Error(`Silpo OAuth token request failed: HTTP ${res.status}`);
    }
    const json: unknown = await res.json();
    recordExternalHttp("silpo", outcomeLabel, ms);
    return TokenResponseSchema.parse(json);
  } catch (err) {
    const ms = elapsedMs(start);
    recordExternalHttp("silpo", `${outcomeLabel}_error`, ms);
    throw err;
  } finally {
    clearTimeout(t);
  }
}

/** Exchanges an authorization `code` for tokens (PKCE `code_verifier` required, no client secret — public client). */
export async function exchangeCode(opts: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<SilpoTokenResponse> {
  if (!env.SILPO_OAUTH_CLIENT_ID) {
    throw new Error("SILPO_OAUTH_CLIENT_ID is not configured");
  }
  return postTokenRequest(
    {
      grant_type: "authorization_code",
      code: opts.code,
      redirect_uri: opts.redirectUri,
      client_id: env.SILPO_OAUTH_CLIENT_ID,
      code_verifier: opts.codeVerifier,
    },
    "token_exchange",
  );
}

/** Refreshes an access token. May return a new `refresh_token` (rotate) or omit it (reuse). */
export async function refreshTokens(
  refreshToken: string,
): Promise<SilpoTokenResponse> {
  if (!env.SILPO_OAUTH_CLIENT_ID) {
    throw new Error("SILPO_OAUTH_CLIENT_ID is not configured");
  }
  return postTokenRequest(
    {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env.SILPO_OAUTH_CLIENT_ID,
    },
    "token_refresh",
  );
}

// ───────────────────── Dynamic Client Registration (runbook) ───────────────

const DcrResponseSchema = z
  .object({
    client_id: z.string().min(1),
    client_secret: z.string().min(1).optional(),
  })
  .passthrough();
export type SilpoDcrResponse = z.infer<typeof DcrResponseSchema>;

/**
 * Dynamic Client Registration (RFC 7591) against `registration_endpoint`.
 * NOT called anywhere at runtime — spec § Рішення дизайну: "DCR — одноразово,
 * client_id у env". This is a one-off ops script entry point (documented
 * runbook step), kept here so it stays next to the metadata/PKCE code it
 * depends on rather than living as throwaway shell history. Re-registration
 * after Silpo revokes/bans the shared client_id is also a runbook step, not
 * an automatic fallback (spec § Ризики — "Спільний DCR client_id — SPOF").
 */
export async function registerDynamicClient(opts: {
  redirectUris: string[];
  clientName?: string;
}): Promise<SilpoDcrResponse> {
  const metadata = await discoverOAuthMetadata();
  if (!metadata.registration_endpoint) {
    throw new Error(
      "Silpo OAuth metadata has no registration_endpoint — Dynamic Client Registration is not supported by this authorization server",
    );
  }
  const res = await fetch(metadata.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      redirect_uris: opts.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none", // public client — PKCE only, no client_secret
      client_name: opts.clientName ?? "Sergeant",
    }),
    signal: AbortSignal.timeout(OAUTH_HTTP_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Silpo DCR failed: HTTP ${res.status}`);
  }
  const json: unknown = await res.json();
  return DcrResponseSchema.parse(json);
}
