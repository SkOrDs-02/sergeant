import crypto from "node:crypto";

/**
 * AES-256-GCM helpers used by the Better Auth database wrapper to encrypt
 * OAuth `accessToken` / `refreshToken` / `idToken` columns at rest in the
 * `account` table (C1 in the security review). The same primitive lives in
 * `modules/mono/crypto.ts`, but that one stores ciphertext as three BYTEA
 * columns. Better Auth always reads/writes those token columns as a single
 * `TEXT`, so we use a tagged in-column ciphertext instead — no schema
 * migration is required and rows that were written before this code shipped
 * keep working as plaintext until the next OAuth refresh re-encrypts them.
 *
 * Format: `enc:v1:<iv-hex>:<tag-hex>:<ciphertext-base64>`
 *
 *   - `iv` (12 bytes) — random per call
 *   - `tag` (16 bytes) — GCM auth tag
 *   - `ciphertext` (base64) — UTF-8 plaintext encrypted under the env key
 *
 * Anything that does NOT start with the `enc:v1:` prefix is treated as
 * plaintext on read (legacy data path). This means the rollout is safe: the
 * adapter writes ciphertext from the moment `BETTER_AUTH_TOKEN_ENC_KEY` is
 * configured, but old rows continue to deserialize correctly until they're
 * refreshed and re-encrypted.
 *
 * Key:
 *   `BETTER_AUTH_TOKEN_ENC_KEY` — 32-byte hex string (64 hex chars).
 *
 * Never log raw tokens or decrypted values.
 */

const ALGO = "aes-256-gcm" as const;
const IV_BYTES = 12;
const PREFIX = "enc:v1:";

function getKey(hexKey: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(hexKey)) {
    throw new Error(
      "BETTER_AUTH_TOKEN_ENC_KEY must be exactly 64 hex chars (32 bytes)",
    );
  }
  return Buffer.from(hexKey, "hex");
}

/**
 * `true` if `value` is in the `enc:v1:...` ciphertext format produced by
 * `encryptString`. Everything else (including `null`/`undefined`/empty) is
 * treated as plaintext or absent on read.
 */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptString(plaintext: string, hexKey: string): string {
  const key = getKey(hexKey);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("base64")}`;
}

/**
 * Decrypt a value produced by `encryptString`.
 *
 * If `value` is not in the `enc:v1:` ciphertext format we return it
 * unchanged so legacy plaintext rows keep working until they're
 * re-encrypted on the next OAuth refresh. Malformed ciphertext (wrong key,
 * truncated payload, tampered tag, etc.) throws — callers must surface
 * that as a 5xx and force re-auth.
 */
export function decryptString(value: string, hexKey: string): string {
  if (!value.startsWith(PREFIX)) return value;
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) {
    throw new Error("encrypted token has invalid structure");
  }
  const [ivHex, tagHex, ctB64] = parts as [string, string, string];
  if (!/^[0-9a-f]+$/i.test(ivHex) || !/^[0-9a-f]+$/i.test(tagHex)) {
    throw new Error("encrypted token has malformed iv/tag");
  }
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  if (iv.length !== IV_BYTES) {
    throw new Error("encrypted token has wrong iv length");
  }
  if (tag.length !== 16) {
    throw new Error("encrypted token has wrong tag length");
  }
  const ct = Buffer.from(ctB64, "base64");
  const key = getKey(hexKey);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
