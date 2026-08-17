import type { KeyRing } from "../../lib/keyRing.js";
import { parseKeyRing } from "../../lib/keyRing.js";
import { env } from "../../env/env.js";
import { query as defaultQuery } from "../../db.js";
import { logger } from "../../obs/logger.js";
import {
  decryptTokenWithRing,
  encryptTokenWithRing,
  LEGACY_KEY_VERSION,
  type EncryptedToken,
} from "../mono/crypto.js";
import { refreshTokens as oauthRefreshTokens } from "./oauth.js";
import type { McpError, McpResult } from "./mcpClient.js";

/**
 * Read/write/refresh path for `silpo_connection` (migration 121). Reuses
 * the generic AES-256-GCM + KeyRing helpers from `modules/mono/crypto.js`
 * (they operate on arbitrary plaintext, nothing Monobank-specific) instead
 * of duplicating them — spec § Поверхня змін: "tokenStore.ts + reuse
 * mono/crypto.ts → спільний lib/". Two independent ciphertext triples
 * (access + refresh) live in one row, encrypted under ONE shared
 * `token_key_version` (see migration 121 comment) — every write/re-encrypt
 * touches both together.
 *
 * Never log raw tokens / decrypted values (Hard Rule #21).
 */

export type QueryFn = typeof defaultQuery;

export type SilpoConnectionStatus = "connected" | "reauth_required";

/**
 * `type` (not `interface`) — matches `mono/tokenStore.ts::MonoTokenRow`'s
 * rationale: a named interface lacks the implicit index signature that the
 * `R extends QueryResultRow` (`{ [column: string]: any }`) constraint on
 * `queryFn<R>()` requires; a `type` alias satisfies it structurally.
 */
export type SilpoConnectionRow = {
  access_token_ciphertext: Buffer;
  access_token_iv: Buffer;
  access_token_tag: Buffer;
  refresh_token_ciphertext: Buffer;
  refresh_token_iv: Buffer;
  refresh_token_tag: Buffer;
  token_key_version: number | null;
  access_token_expires_at: Date | string | null;
  status: SilpoConnectionStatus;
};

/**
 * Builds the Silpo token `KeyRing` from validated `env` (mirrors
 * `mono/tokenStore.ts::monoKeyRing`). Returns `null` when neither
 * `SILPO_TOKEN_ENC_KEYS` nor the legacy `SILPO_TOKEN_ENC_KEY` is
 * configured — `assertStartupEnv` already makes this fatal at boot when
 * `SILPO_ENABLED=true`, so a `null` here in practice only happens in tests
 * or a misconfigured `SILPO_ENABLED=false` dev box.
 */
export function silpoKeyRing(override?: {
  keysCsv?: string | null | undefined;
  currentVersion?: string | null | undefined;
  legacyKey?: string | null | undefined;
}): KeyRing | null {
  const source = override ?? {
    keysCsv: env.SILPO_TOKEN_ENC_KEYS,
    currentVersion: env.SILPO_TOKEN_ENC_KEY_CURRENT_VERSION,
    legacyKey: env.SILPO_TOKEN_ENC_KEY,
  };
  return parseKeyRing({ ...source, envName: "SILPO_TOKEN_ENC_KEY" });
}

// ────────────────────────────── Decrypt / read ──────────────────────────────

export interface DecryptedSilpoConnection {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
  status: SilpoConnectionStatus;
}

/**
 * `readAndDecrypt` outcome. A discriminated union (not `T | null`) because
 * "no row at all" (`not_connected`) and "row exists but its
 * `token_key_version` was retired from the ring" (`reauth_required`) are
 * two DIFFERENT states the caller (`callWithFreshAccessToken`) must map to
 * different `AppError`s (409 `SILPO_NOT_CONNECTED` vs 409
 * `SILPO_REAUTH_REQUIRED`) — collapsing both into `null` would surface a
 * rotated-out key as "not connected", which is wrong (the user IS
 * connected, they just need to re-consent).
 */
export type ReadAndDecryptResult =
  | { kind: "connected"; connection: DecryptedSilpoConnection }
  | { kind: "not_connected" }
  | { kind: "reauth_required" };

function rowToEncrypted(row: SilpoConnectionRow): {
  access: EncryptedToken;
  refresh: EncryptedToken;
} {
  const keyVersion = row.token_key_version ?? undefined;
  const access: EncryptedToken = {
    ciphertext: row.access_token_ciphertext,
    iv: row.access_token_iv,
    tag: row.access_token_tag,
  };
  const refresh: EncryptedToken = {
    ciphertext: row.refresh_token_ciphertext,
    iv: row.refresh_token_iv,
    tag: row.refresh_token_tag,
  };
  if (keyVersion !== undefined) {
    access.keyVersion = keyVersion;
    refresh.keyVersion = keyVersion;
  }
  return { access, refresh };
}

/**
 * Reads + decrypts a user's `silpo_connection` row. Returns `{ kind:
 * "not_connected" }` when the user has never connected. Opportunistically
 * (best-effort, never throws) re-encrypts BOTH triples together under
 * `ring.current.version` when the row is under a stale-but-still-present
 * key version.
 *
 * A row whose `token_key_version` was retired from the ring entirely
 * (rotation exit — the old key was dropped from `SILPO_TOKEN_ENC_KEYS`
 * before this row got lazily re-encrypted) can NEVER be decrypted again.
 * Before this fix, `decryptTokenWithRing` → `getKeyForVersion` threw for
 * that case and the throw propagated all the way to a generic 500 at the
 * route. That row is unrecoverable but NOT a server bug — it's exactly the
 * situation `status = 'reauth_required'` models, so we flip the row to
 * that status and return `{ kind: "reauth_required" }` instead of
 * throwing. Any OTHER decrypt failure (tampered ciphertext/auth-tag
 * mismatch under a key version that IS present) still throws — fail
 * closed, per `decryptTokenWithRing`'s docstring.
 */
export async function readAndDecrypt(
  userId: string,
  ring: KeyRing,
  queryFn: QueryFn = defaultQuery,
): Promise<ReadAndDecryptResult> {
  const { rows } = await queryFn<SilpoConnectionRow>(
    `SELECT access_token_ciphertext, access_token_iv, access_token_tag,
            refresh_token_ciphertext, refresh_token_iv, refresh_token_tag,
            token_key_version, access_token_expires_at, status
       FROM silpo_connection WHERE user_id = $1`,
    [userId],
    { op: "silpo_connection_select" },
  );
  const row = rows[0];
  if (!row) return { kind: "not_connected" };

  const rowVersion = row.token_key_version ?? LEGACY_KEY_VERSION;

  if (!ring.byVersion.has(rowVersion)) {
    logger.warn({
      msg: "silpo_token_key_version_rotated_out",
      rowVersion,
      ringVersions: ring.versions,
    });
    await markReauthRequired(userId, queryFn);
    return { kind: "reauth_required" };
  }

  const { access, refresh } = rowToEncrypted(row);
  const accessToken = decryptTokenWithRing(access, ring, rowVersion);
  const refreshToken = decryptTokenWithRing(refresh, ring, rowVersion);

  if (rowVersion !== ring.current.version) {
    await lazyReencryptBoth(
      { accessToken, refreshToken },
      userId,
      ring,
      row,
      queryFn,
    );
  }

  return {
    kind: "connected",
    connection: {
      accessToken,
      refreshToken,
      expiresAt: row.access_token_expires_at
        ? new Date(row.access_token_expires_at)
        : null,
      status: row.status,
    },
  };
}

/**
 * Best-effort re-encrypt + persist of both token triples under
 * `ring.current`. Mirrors `mono/tokenStore.ts::lazyReencrypt` — guarded by
 * an optimistic WHERE on the access-token ciphertext we just read, so a
 * concurrent connect/refresh that already rewrote the row isn't clobbered.
 * Never throws.
 */
async function lazyReencryptBoth(
  plaintext: { accessToken: string; refreshToken: string },
  userId: string,
  ring: KeyRing,
  staleRow: SilpoConnectionRow,
  queryFn: QueryFn,
): Promise<void> {
  try {
    const access = encryptTokenWithRing(plaintext.accessToken, ring);
    const refresh = encryptTokenWithRing(plaintext.refreshToken, ring);
    const res = await queryFn(
      `UPDATE silpo_connection
          SET access_token_ciphertext = $2,
              access_token_iv = $3,
              access_token_tag = $4,
              refresh_token_ciphertext = $5,
              refresh_token_iv = $6,
              refresh_token_tag = $7,
              token_key_version = $8,
              updated_at = NOW()
        WHERE user_id = $1
          AND access_token_ciphertext = $9`,
      [
        userId,
        access.ciphertext,
        access.iv,
        access.tag,
        refresh.ciphertext,
        refresh.iv,
        refresh.tag,
        access.keyVersion,
        staleRow.access_token_ciphertext,
      ],
      { op: "silpo_token_lazy_reencrypt" },
    );
    if ((res.rowCount ?? 0) > 0) {
      logger.info({
        msg: "silpo.token.lazy_reencrypted",
        current_version: ring.current.version,
      });
    }
  } catch (err) {
    // Best-effort: MUST NOT fail the caller. Row stays under its old (still
    // valid) key version and is retried on the next read.
    logger.warn({
      msg: "silpo_token_lazy_reencrypt_failed",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────── Write / persist ────────────────────────────

export interface TokensToPersist {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms, or `null` when the provider didn't report `expires_in`. */
  expiresAtMs: number | null;
}

/** Upserts both encrypted triples + `status = 'connected'`. */
export async function persistTokens(
  userId: string,
  ring: KeyRing,
  tokens: TokensToPersist,
  queryFn: QueryFn = defaultQuery,
): Promise<void> {
  const access = encryptTokenWithRing(tokens.accessToken, ring);
  const refresh = encryptTokenWithRing(tokens.refreshToken, ring);
  await queryFn(
    `INSERT INTO silpo_connection
       (user_id, access_token_ciphertext, access_token_iv, access_token_tag,
        refresh_token_ciphertext, refresh_token_iv, refresh_token_tag,
        token_key_version, access_token_expires_at, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'connected', NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       access_token_ciphertext = EXCLUDED.access_token_ciphertext,
       access_token_iv = EXCLUDED.access_token_iv,
       access_token_tag = EXCLUDED.access_token_tag,
       refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
       refresh_token_iv = EXCLUDED.refresh_token_iv,
       refresh_token_tag = EXCLUDED.refresh_token_tag,
       token_key_version = EXCLUDED.token_key_version,
       access_token_expires_at = EXCLUDED.access_token_expires_at,
       status = 'connected',
       updated_at = NOW()`,
    [
      userId,
      access.ciphertext,
      access.iv,
      access.tag,
      refresh.ciphertext,
      refresh.iv,
      refresh.tag,
      access.keyVersion,
      tokens.expiresAtMs !== null ? new Date(tokens.expiresAtMs) : null,
    ],
    { op: "silpo_connection_upsert" },
  );
}

/**
 * Flips `status = 'reauth_required'` — refresh-flow exhausted (second 401
 * after a successful refresh, or the refresh request itself failed).
 * Tokens are left in place (not deleted): a future successful `/connect`
 * re-run overwrites them via `persistTokens`.
 */
export async function markReauthRequired(
  userId: string,
  queryFn: QueryFn = defaultQuery,
): Promise<void> {
  await queryFn(
    `UPDATE silpo_connection SET status = 'reauth_required', updated_at = NOW() WHERE user_id = $1`,
    [userId],
    { op: "silpo_connection_mark_reauth_required" },
  );
  logger.info({ msg: "silpo.connection.reauth_required" });
}

// ───────────────────────── Authenticated-call coordinator ───────────────────

export type SilpoAuthedCallErrorKind =
  "config_missing" | "not_connected" | "reauth_required";

export type SilpoAuthedCallResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: McpError | { kind: SilpoAuthedCallErrorKind; message: string };
    };

/**
 * Runs `fn(accessToken)` against the current connection, transparently
 * handling the lazy-refresh-on-401 dance (spec § Рішення дизайну,
 * "Refresh-flow — lazy при 401, за зразком mono/tokenStore.ts"):
 *
 *   1. No connection at all → `not_connected` (caller should prompt Connect).
 *   2. Row already `reauth_required` → short-circuits without calling `fn`.
 *   3. `fn` returns `auth_required` (HTTP 401 from MCP) → refresh once,
 *      persist the new tokens, retry `fn` ONE more time.
 *   4. Still `auth_required` after the retry → `markReauthRequired` and
 *      return `reauth_required` — never a silent third attempt/loop.
 *
 * Any other {@link McpError} (`rate_limited`, `upstream_unavailable`,
 * `schema_drift`, `protocol_error`) passes through unchanged — those are
 * not auth problems and must not trigger a refresh.
 */
export async function callWithFreshAccessToken<T>(
  userId: string,
  fn: (accessToken: string) => Promise<McpResult<T>>,
  deps: { ring?: KeyRing | null; query?: QueryFn } = {},
): Promise<SilpoAuthedCallResult<T>> {
  const ring = deps.ring ?? silpoKeyRing();
  const queryFn = deps.query ?? defaultQuery;
  if (!ring) {
    return {
      ok: false,
      error: {
        kind: "config_missing",
        message: "Silpo token encryption key is not configured",
      },
    };
  }

  const decrypted = await readAndDecrypt(userId, ring, queryFn);
  if (decrypted.kind === "not_connected") {
    return {
      ok: false,
      error: { kind: "not_connected", message: "Silpo is not connected" },
    };
  }
  if (decrypted.kind === "reauth_required") {
    return {
      ok: false,
      error: {
        kind: "reauth_required",
        message: "Silpo connection needs re-authorization",
      },
    };
  }
  const connection = decrypted.connection;
  if (connection.status === "reauth_required") {
    return {
      ok: false,
      error: {
        kind: "reauth_required",
        message: "Silpo connection needs re-authorization",
      },
    };
  }

  const first = await fn(connection.accessToken);
  if (first.ok || first.error.kind !== "auth_required") return first;

  let refreshedAccessToken: string;
  try {
    const refreshed = await oauthRefreshTokens(connection.refreshToken);
    await persistTokens(
      userId,
      ring,
      {
        accessToken: refreshed.access_token,
        // Refresh grants MAY omit a new refresh_token — reuse the prior one.
        refreshToken: refreshed.refresh_token ?? connection.refreshToken,
        expiresAtMs: refreshed.expires_in
          ? Date.now() + refreshed.expires_in * 1000
          : null,
      },
      queryFn,
    );
    refreshedAccessToken = refreshed.access_token;
  } catch (err) {
    await markReauthRequired(userId, queryFn);
    logger.warn({
      msg: "silpo_token_refresh_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      error: {
        kind: "reauth_required",
        message: "Silpo refresh token exchange failed",
      },
    };
  }

  const second = await fn(refreshedAccessToken);
  if (second.ok) return second;
  if (second.error.kind === "auth_required") {
    await markReauthRequired(userId, queryFn);
    return {
      ok: false,
      error: {
        kind: "reauth_required",
        message: "Silpo access denied twice after refresh",
      },
    };
  }
  return second;
}
