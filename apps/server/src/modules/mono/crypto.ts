import crypto from "node:crypto";

/**
 * AES-256-GCM helpers for encrypting/decrypting Monobank personal tokens.
 *
 * Key: `MONO_TOKEN_ENC_KEY` env var — 32-byte hex string (64 hex chars).
 * Output: ciphertext (Buffer), iv (12 bytes), tag (16 bytes) — stored as
 * BYTEA columns in `mono_connection`.
 *
 * Never log raw tokens or decrypted values.
 */

const ALGO = "aes-256-gcm" as const;
const IV_BYTES = 12;

export interface EncryptedToken {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

function getKey(hexKey: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(hexKey)) {
    throw new Error(
      "MONO_TOKEN_ENC_KEY must be exactly 64 hex chars (32 bytes)",
    );
  }
  return Buffer.from(hexKey, "hex");
}

export function encryptToken(
  plaintext: string,
  hexKey: string,
): EncryptedToken {
  const key = getKey(hexKey);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return { ciphertext: encrypted, iv, tag };
}

export function decryptToken(enc: EncryptedToken, hexKey: string): string {
  const key = getKey(hexKey);
  const decipher = crypto.createDecipheriv(ALGO, key, enc.iv);
  decipher.setAuthTag(enc.tag);
  const decrypted = Buffer.concat([
    decipher.update(enc.ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

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
