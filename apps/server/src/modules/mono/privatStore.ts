import { query } from "../../db.js";
import {
  encryptTokenWithRing,
  decryptTokenWithRing,
  tokenFingerprint,
} from "./crypto.js";
import { monoKeyRing } from "./tokenStore.js";

/**
 * Server-side storage for PrivatBank merchant credentials (`privat_connection`).
 *
 * Why this module exists: the merchant token used to live in the browser's
 * `localStorage` and travelled to us in an `X-Privat-Token` header, which put
 * a live bank credential one DevTools tab away from anyone using the app.
 * Spec: `docs/90-work/planning/specs/beta-security-readiness.md` (F1).
 *
 * The at-rest format deliberately mirrors `mono_connection`: AES-256-GCM in
 * three BYTEA columns plus a `token_key_version`, so both banks decrypt
 * through the same `crypto.ts` helpers and share one KeyRing. Reusing
 * `monoKeyRing()` is intentional — these are the same trust domain ("a user's
 * bank credentials"), and a second env key would add a secret to rotate
 * without changing the threat model.
 *
 * Never log the merchant token or the decrypted value (Hard Rule #21).
 */

export interface PrivatCredentials {
  merchantId: string;
  token: string;
}

interface PrivatRow {
  merchant_id: string;
  token_ciphertext: Buffer;
  token_iv: Buffer;
  token_tag: Buffer;
  token_key_version: number | null;
}

/**
 * Encrypt and upsert the credentials for `userId`. Re-connecting overwrites
 * the previous row: a user has exactly one PrivatBank merchant account, and
 * keeping stale ciphertext around would only widen the blast radius of a key
 * compromise.
 */
export async function savePrivatCredentials(
  userId: string,
  creds: PrivatCredentials,
): Promise<void> {
  const ring = monoKeyRing();
  if (!ring) {
    throw new Error("Missing bank-token encryption key");
  }
  const enc = encryptTokenWithRing(creds.token, ring);
  await query(
    `INSERT INTO privat_connection (
       user_id, merchant_id, token_ciphertext, token_iv, token_tag,
       token_key_version, token_fingerprint, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       merchant_id = EXCLUDED.merchant_id,
       token_ciphertext = EXCLUDED.token_ciphertext,
       token_iv = EXCLUDED.token_iv,
       token_tag = EXCLUDED.token_tag,
       token_key_version = EXCLUDED.token_key_version,
       token_fingerprint = EXCLUDED.token_fingerprint,
       updated_at = NOW()`,
    [
      userId,
      creds.merchantId,
      enc.ciphertext,
      enc.iv,
      enc.tag,
      enc.keyVersion,
      tokenFingerprint(creds.token),
    ],
    { op: "privat_connection_upsert" },
  );
}

/**
 * Load and decrypt the credentials for `userId`, or `null` when the user has
 * no PrivatBank connection.
 *
 * Throws only when a row exists but cannot be decrypted (key version retired,
 * ciphertext tampered with) — fail closed rather than proxy an upstream call
 * with a wrong token.
 */
export async function loadPrivatCredentials(
  userId: string,
): Promise<PrivatCredentials | null> {
  const ring = monoKeyRing();
  if (!ring) {
    throw new Error("Missing bank-token encryption key");
  }
  const res = await query<PrivatRow>(
    `SELECT merchant_id, token_ciphertext, token_iv, token_tag, token_key_version
       FROM privat_connection
      WHERE user_id = $1`,
    [userId],
    { op: "privat_connection_read" },
  );
  const row = res.rows[0];
  if (!row) return null;

  const token = decryptTokenWithRing(
    {
      ciphertext: row.token_ciphertext,
      iv: row.token_iv,
      tag: row.token_tag,
    },
    ring,
    row.token_key_version,
  );
  return { merchantId: row.merchant_id, token };
}

/** Delete the connection. Idempotent — disconnecting twice is not an error. */
export async function deletePrivatCredentials(userId: string): Promise<void> {
  await query(`DELETE FROM privat_connection WHERE user_id = $1`, [userId], {
    op: "privat_connection_delete",
  });
}

/**
 * Connection status for the settings screen. Returns the merchant id so the
 * UI can show which account is linked; the token never leaves the server.
 */
export async function getPrivatStatus(
  userId: string,
): Promise<{ connected: boolean; merchantId: string | null }> {
  const res = await query<{ merchant_id: string }>(
    `SELECT merchant_id FROM privat_connection WHERE user_id = $1`,
    [userId],
    { op: "privat_connection_status" },
  );
  const row = res.rows[0];
  return row
    ? { connected: true, merchantId: row.merchant_id }
    : { connected: false, merchantId: null };
}
