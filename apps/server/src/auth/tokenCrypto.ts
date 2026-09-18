import crypto from "node:crypto";
import type { KeyRing } from "../lib/keyRing.js";
import { getKeyForVersion } from "../lib/keyRing.js";

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
 * Format (legacy / single-key): `enc:v1:<iv-hex>:<tag-hex>:<ciphertext-base64>`
 * Format (multi-key, H4):       `enc:v2:k<keyVersion>:<iv-hex>:<tag-hex>:<ciphertext-base64>`
 *
 *   - `keyVersion` (decimal positive integer) — який key із key-ring-а
 *     використовувався для шифрування цього рядка. Дозволяє dual-key
 *     rollout / rotation без offline outage (H4).
 *   - `iv` (12 bytes) — random per call
 *   - `tag` (16 bytes) — GCM auth tag
 *   - `ciphertext` (base64) — UTF-8 plaintext encrypted under the env key
 *
 * Anything that does NOT start with `enc:v1:` or `enc:v2:` is treated as
 * plaintext on read (legacy data path). This means the rollout is safe: the
 * adapter writes ciphertext from the moment `BETTER_AUTH_TOKEN_ENC_KEY` (or
 * `_KEYS`) is configured, but old rows continue to deserialize correctly
 * until they're refreshed and re-encrypted.
 *
 * `enc:v1:` is treated as `keyVersion=1` (read-only; `encryptString` only
 * emits `enc:v2:`).
 *
 * Keys:
 *   - Legacy: `BETTER_AUTH_TOKEN_ENC_KEY` (single 64-hex string).
 *   - H4:     `BETTER_AUTH_TOKEN_ENC_KEYS=v1:hex,v2:hex` +
 *              `BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION=v2`.
 *
 * `KeyRing` (від `lib/keyRing.ts`) уніфікує обидва формати.
 *
 * Never log raw tokens or decrypted values.
 */

const ALGO = "aes-256-gcm" as const;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PREFIX_V1 = "enc:v1:";
const PREFIX_V2 = "enc:v2:";

const HEX_RE = /^[0-9a-f]+$/i;

function ringFromHexKey(hexKey: string): KeyRing {
  if (!/^[0-9a-f]{64}$/i.test(hexKey)) {
    throw new Error(
      "BETTER_AUTH_TOKEN_ENC_KEY must be exactly 64 hex chars (32 bytes)",
    );
  }
  const buf = Buffer.from(hexKey, "hex");
  return {
    current: { version: 1, key: buf },
    byVersion: new Map<number, Buffer>([[1, buf]]),
    versions: [1],
  };
}

function asKeyRing(input: string | KeyRing): KeyRing {
  return typeof input === "string" ? ringFromHexKey(input) : input;
}

/**
 * `true` if `value` is in any `enc:vN:...` ciphertext format produced by
 * `encryptString`. Everything else (including `null`/`undefined`/empty) is
 * treated as plaintext or absent on read.
 */
export function isEncrypted(value: string | null | undefined): boolean {
  return (
    typeof value === "string" &&
    (value.startsWith(PREFIX_V1) || value.startsWith(PREFIX_V2))
  );
}

/**
 * Витягнути key version із `enc:vN:...` рядка.
 *
 * Returns `null` для plaintext / non-`enc:` value. Throws на malformed
 * `enc:`-рядках (caller повинен потім повторно зашифрувати або відмовити).
 */
export function readKeyVersion(
  value: string | null | undefined,
): number | null {
  if (typeof value !== "string") return null;
  if (value.startsWith(PREFIX_V1)) return 1;
  if (!value.startsWith(PREFIX_V2)) return null;
  const after = value.slice(PREFIX_V2.length);
  const colon = after.indexOf(":");
  if (colon < 0) {
    throw new Error("encrypted token (v2) has no key-version separator");
  }
  const label = after.slice(0, colon);
  if (!label.startsWith("k")) {
    throw new Error(
      `encrypted token (v2) malformed key-version segment "${label}"`,
    );
  }
  const n = Number(label.slice(1));
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(
      `encrypted token (v2) invalid key-version segment "${label}"`,
    );
  }
  return n;
}

export function encryptString(
  plaintext: string,
  keyOrRing: string | KeyRing,
): string {
  const ring = asKeyRing(keyOrRing);
  const { version, key } = ring.current;
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX_V2}k${version}:${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("base64")}`;
}

/**
 * Decrypt a value produced by `encryptString` (v1 or v2).
 *
 * If `value` is not in any `enc:vN:` format we return it unchanged so legacy
 * plaintext rows keep working until they're re-encrypted on the next OAuth
 * refresh. Malformed ciphertext, missing key for the recorded version, or
 * tampered tag throws — callers must surface that as a 5xx and force
 * re-auth.
 */
export function decryptString(
  value: string,
  keyOrRing: string | KeyRing,
): string {
  const ring = asKeyRing(keyOrRing);

  if (value.startsWith(PREFIX_V2)) {
    const parts = value.slice(PREFIX_V2.length).split(":");
    if (parts.length !== 4) {
      throw new Error("encrypted token (v2) has invalid structure");
    }
    const [versionLabel, ivHex, tagHex, ctB64] = parts as [
      string,
      string,
      string,
      string,
    ];
    if (!versionLabel.startsWith("k")) {
      throw new Error("encrypted token (v2) malformed key-version segment");
    }
    const version = Number(versionLabel.slice(1));
    if (!Number.isInteger(version) || version <= 0) {
      throw new Error("encrypted token (v2) malformed key-version segment");
    }
    return decodeOnce(ring, version, ivHex, tagHex, ctB64);
  }

  if (value.startsWith(PREFIX_V1)) {
    const parts = value.slice(PREFIX_V1.length).split(":");
    if (parts.length !== 3) {
      throw new Error("encrypted token has invalid structure");
    }
    const [ivHex, tagHex, ctB64] = parts as [string, string, string];
    return decodeOnce(ring, 1, ivHex, tagHex, ctB64);
  }

  return value;
}

function decodeOnce(
  ring: KeyRing,
  version: number,
  ivHex: string,
  tagHex: string,
  ctB64: string,
): string {
  if (!HEX_RE.test(ivHex) || !HEX_RE.test(tagHex)) {
    throw new Error("encrypted token has malformed iv/tag");
  }
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  if (iv.length !== IV_BYTES) {
    throw new Error("encrypted token has wrong iv length");
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error("encrypted token has wrong tag length");
  }
  const ct = Buffer.from(ctB64, "base64");
  const key = getKeyForVersion(ring, version);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
