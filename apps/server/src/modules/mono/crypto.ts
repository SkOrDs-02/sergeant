import crypto from "node:crypto";
import type { KeyRing } from "../../lib/keyRing.js";
import { getKeyForVersion } from "../../lib/keyRing.js";

/**
 * AES-256-GCM helpers for encrypting/decrypting Monobank personal tokens.
 *
 * Storage shape: ciphertext (Buffer), iv (12 bytes), tag (16 bytes) — stored
 * as three BYTEA columns in `mono_connection` (`token_ciphertext`,
 * `token_iv`, `token_tag`). H4 Phase 2 adds a fourth column,
 * `token_key_version SMALLINT NULL`, recording which KeyRing key version
 * encrypted the row.
 *
 * H4 (`docs/security/hardening/H4-encryption-key-rotation.md`): keys are now
 * managed by the versioned `KeyRing` (`apps/server/src/lib/keyRing.ts`), the
 * same infra Phase 1 gave Better Auth, so they can be rotated without a
 * downtime re-encrypt pass.
 *
 * Two ciphertext shapes coexist and BOTH decrypt transparently:
 *   - **Legacy unversioned** (written before this PR): `token_key_version`
 *     is NULL in the DB. Read it as key version 1 — the legacy single-key
 *     fallback in `parseKeyRing` maps `MONO_TOKEN_ENC_KEY` onto `{version:1}`,
 *     so an unrotated deploy decrypts its own historical rows unchanged.
 *   - **Versioned** (written by this PR): `token_key_version = ring.current
 *     .version`, ciphertext encrypted under `ring.current.key`.
 *
 * Backward-compatibility guarantee: NULL/absent `token_key_version` is
 * always interpreted as version 1, NEVER assumed to be the current version.
 * On a v1-only ring (no rotation yet) versioned and legacy rows are byte-for-
 * byte interchangeable — only the column annotation differs.
 *
 * The legacy `encryptToken(plaintext, hexKey)` / `decryptToken(enc, hexKey)`
 * helpers are retained for callers that still pass a raw hex key; internally
 * they build a v1-only ring, so their on-disk format is identical to a
 * versioned v1 row.
 *
 * Never log raw tokens or decrypted values (Hard Rule #21).
 */

const ALGO = "aes-256-gcm" as const;
const IV_BYTES = 12;

/**
 * Default key version assumed for a row whose `token_key_version` column is
 * NULL — i.e. legacy unversioned ciphertext written before H4 Phase 2.
 */
export const LEGACY_KEY_VERSION = 1;

export interface EncryptedToken {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  /**
   * KeyRing version that produced this ciphertext. Populated by
   * `encryptTokenWithRing`. `undefined` on the legacy `encryptToken` path
   * (treated as {@link LEGACY_KEY_VERSION} on read).
   */
  keyVersion?: number;
}

function getKey(hexKey: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(hexKey)) {
    throw new Error(
      "MONO_TOKEN_ENC_KEY must be exactly 64 hex chars (32 bytes)",
    );
  }
  return Buffer.from(hexKey, "hex");
}

function ringFromHexKey(hexKey: string): KeyRing {
  const buf = getKey(hexKey);
  return {
    current: { version: LEGACY_KEY_VERSION, key: buf },
    byVersion: new Map<number, Buffer>([[LEGACY_KEY_VERSION, buf]]),
    versions: [LEGACY_KEY_VERSION],
  };
}

function encryptWithKey(
  plaintext: string,
  key: Buffer,
): Omit<EncryptedToken, "keyVersion"> {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return { ciphertext: encrypted, iv, tag };
}

function decryptWithKey(enc: EncryptedToken, key: Buffer): string {
  const decipher = crypto.createDecipheriv(ALGO, key, enc.iv);
  decipher.setAuthTag(enc.tag);
  const decrypted = Buffer.concat([
    decipher.update(enc.ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Legacy single-key encrypt. Kept for callers that pass a raw hex key.
 * Produces a v1 ciphertext (omits `keyVersion`; on-disk identical to a
 * versioned v1 row).
 */
export function encryptToken(
  plaintext: string,
  hexKey: string,
): EncryptedToken {
  return encryptWithKey(plaintext, getKey(hexKey));
}

/**
 * Legacy single-key decrypt. Kept for callers that pass a raw hex key.
 * Decrypts under that single key regardless of `enc.keyVersion`.
 */
export function decryptToken(enc: EncryptedToken, hexKey: string): string {
  return decryptWithKey(enc, getKey(hexKey));
}

/**
 * Encrypt a token under the KeyRing's **current** (primary) key. The returned
 * `keyVersion` MUST be persisted into `mono_connection.token_key_version` so
 * the row can be decrypted after a future rotation removes older keys.
 */
export function encryptTokenWithRing(
  plaintext: string,
  ring: KeyRing,
): Required<EncryptedToken> {
  const { version, key } = ring.current;
  return { ...encryptWithKey(plaintext, key), keyVersion: version };
}

/**
 * Decrypt a token using the per-row key version.
 *
 * `enc.keyVersion` comes from `mono_connection.token_key_version`. A NULL/
 * `undefined`/`null` column (legacy unversioned ciphertext) is read as
 * {@link LEGACY_KEY_VERSION} — never as the current version. The key for that
 * version is resolved from the ring; if the version is absent from the ring
 * (e.g. retired too early during rotation) `getKeyForVersion` throws, so we
 * fail closed rather than return wrong plaintext. A tampered tag/ciphertext
 * fails the GCM auth check and also throws.
 */
export function decryptTokenWithRing(
  enc: EncryptedToken,
  ring: KeyRing,
  rowKeyVersion?: number | null,
): string {
  const version = rowKeyVersion ?? enc.keyVersion ?? LEGACY_KEY_VERSION;
  const key = getKeyForVersion(ring, version);
  return decryptWithKey(enc, key);
}

// re-exported for tests
export const __test__ = { ringFromHexKey };

export function tokenFingerprint(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * SHA-256 of the Monobank webhook path secret. Matches the value computed
 * by migration 017 (`encode(sha256(convert_to(secret, 'UTF8')), 'hex')`):
 * Node's default `update(string)` is also UTF-8 and `digest('hex')` is
 * lowercase. Used to make the webhook lookup oblivious to the secret's
 * content so SQL execution time can't leak it byte-by-byte.
 */
export function webhookSecretHash(secret: string): string {
  return crypto.createHash("sha256").update(secret, "utf8").digest("hex");
}
