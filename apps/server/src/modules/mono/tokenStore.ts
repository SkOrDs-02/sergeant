import type { KeyRing } from "../../lib/keyRing.js";
import { parseKeyRing } from "../../lib/keyRing.js";
import { env } from "../../env/env.js";
import { query as defaultQuery } from "../../db.js";
import { logger } from "../../obs/logger.js";
import { monoTokenLazyReencryptTotal } from "../../obs/metrics.js";
import {
  decryptTokenWithRing,
  encryptTokenWithRing,
  LEGACY_KEY_VERSION,
  type EncryptedToken,
} from "./crypto.js";

/**
 * Read/decrypt path for Monobank tokens stored in `mono_connection`
 * (H4 Phase 2).
 *
 * `mono_connection` keeps the AES-256-GCM token as three BYTEA columns
 * (`token_ciphertext` / `token_iv` / `token_tag`) plus a nullable
 * `token_key_version SMALLINT` recording which KeyRing version encrypted it:
 *   - NULL  → legacy unversioned ciphertext (decrypt under v1).
 *   - 1..N  → versioned ciphertext (decrypt under that version's key).
 *
 * On every successful read this module opportunistically re-encrypts any row
 * not already under `ring.current.version` and writes it back in the
 * versioned format. The re-encrypt is **best-effort**: a failed write is
 * logged + counted but never propagates, so a transient DB hiccup can't break
 * a user's bank connection.
 *
 * Never log raw tokens / decrypted values / keys (Hard Rule #21).
 */

/** Minimal query interface — the subset of `db.query` we need (testable). */
/**
 * Minimal query interface the lazy re-encrypt UPDATE needs. Structurally
 * satisfied by `db.ts::query` (the default) and by the injected `query`
 * shape used in `rotateSecret.ts` / unit tests.
 */
export type QueryFn = (
  text: string,
  values?: unknown[],
  meta?: { op?: string },
) => Promise<{ rowCount?: number | null }>;

/**
 * `type` (not `interface`) so it structurally satisfies the
 * `R extends Record<string, unknown>` constraint on the injected `query`
 * generic in `rotateSecret.ts` — a named interface lacks the implicit index
 * signature that constraint requires.
 */
export type MonoTokenRow = {
  token_ciphertext: Buffer;
  token_iv: Buffer;
  token_tag: Buffer;
  /** NULL for legacy rows written before migration 074. */
  token_key_version: number | null;
};

/**
 * Build the Mono token `KeyRing` from the validated `env` module (same source
 * `assertStartupEnv` already validated, and the same pattern `auth.ts` uses
 * for the Better Auth ring). Returns `null` when neither `MONO_TOKEN_ENC_KEYS`
 * nor the legacy `MONO_TOKEN_ENC_KEY` is configured — callers decide whether
 * that's fatal (the route handlers respond 500/503).
 *
 * `override` lets unit tests inject raw env values without touching the
 * process-wide `env` singleton.
 */
export function monoKeyRing(override?: {
  keysCsv?: string | null | undefined;
  currentVersion?: string | null | undefined;
  legacyKey?: string | null | undefined;
}): KeyRing | null {
  // When `override` is supplied (unit tests) it fully replaces the env source
  // — no merge — so a test can express "nothing configured" without depending
  // on the ambient `env` singleton.
  const source = override ?? {
    keysCsv: env.MONO_TOKEN_ENC_KEYS,
    currentVersion: env.MONO_TOKEN_ENC_KEY_CURRENT_VERSION,
    legacyKey: env.MONO_TOKEN_ENC_KEY,
  };
  return parseKeyRing({ ...source, envName: "MONO_TOKEN_ENC_KEY" });
}

function rowToEncryptedToken(row: MonoTokenRow): EncryptedToken {
  const enc: EncryptedToken = {
    ciphertext: row.token_ciphertext,
    iv: row.token_iv,
    tag: row.token_tag,
  };
  if (row.token_key_version != null) enc.keyVersion = row.token_key_version;
  return enc;
}

/**
 * Decrypt a `mono_connection` token row under its per-row key version, then
 * (best-effort) lazily re-encrypt it under `ring.current.version` if it's
 * stale. Returns the plaintext token.
 *
 * Throws only when the row genuinely cannot be decrypted (missing key
 * version in the ring, tampered ciphertext) — fail closed, never return wrong
 * plaintext. The lazy re-encrypt step is wrapped so its failure is swallowed.
 */
export async function decryptAndLazyReencrypt(
  row: MonoTokenRow,
  userId: string,
  ring: KeyRing,
  query: QueryFn = defaultQuery,
): Promise<string> {
  const rowVersion = row.token_key_version ?? LEGACY_KEY_VERSION;
  const plaintext = decryptTokenWithRing(
    rowToEncryptedToken(row),
    ring,
    rowVersion,
  );

  if (rowVersion !== ring.current.version) {
    await lazyReencrypt(plaintext, userId, ring, row, query);
  }

  return plaintext;
}

/**
 * Best-effort re-encrypt + persist of a stale-version row under
 * `ring.current`. Never throws.
 *
 * The UPDATE is guarded by an optimistic `token_fingerprint`/version WHERE so
 * a concurrent connect/rotate that already rewrote the row isn't clobbered:
 * we only overwrite the exact ciphertext we just read. If 0 rows match, a
 * fresher write won the race — that's fine, nothing to do.
 */
async function lazyReencrypt(
  plaintext: string,
  userId: string,
  ring: KeyRing,
  staleRow: MonoTokenRow,
  query: QueryFn,
): Promise<void> {
  const rowVersionLabel =
    staleRow.token_key_version == null
      ? "legacy"
      : String(staleRow.token_key_version);
  try {
    const re = encryptTokenWithRing(plaintext, ring);
    const res = await query(
      `UPDATE mono_connection
          SET token_ciphertext = $2,
              token_iv = $3,
              token_tag = $4,
              token_key_version = $5
        WHERE user_id = $1
          AND token_ciphertext = $6`,
      [
        userId,
        re.ciphertext,
        re.iv,
        re.tag,
        re.keyVersion,
        staleRow.token_ciphertext,
      ],
      { op: "mono_token_lazy_reencrypt" },
    );
    // rowCount === 0 → a concurrent writer already refreshed the row; no-op.
    if ((res.rowCount ?? 0) > 0) {
      monoTokenLazyReencryptTotal.inc({
        row_version: rowVersionLabel,
        outcome: "reencrypted",
      });
      logger.info({
        event: "mono.token.lazy_reencrypted",
        row_version: rowVersionLabel,
        current_version: ring.current.version,
      });
    }
  } catch (err) {
    // Best-effort: a failed re-encrypt MUST NOT fail the caller's request.
    // The row stays under its old (still-valid) key version and will be
    // retried on the next read.
    monoTokenLazyReencryptTotal.inc({
      row_version: rowVersionLabel,
      outcome: "reencrypt_failed",
    });
    logger.warn({
      msg: "mono_token_lazy_reencrypt_failed",
      row_version: rowVersionLabel,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
