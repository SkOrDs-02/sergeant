import { describe, it, expect } from "vitest";
import {
  encryptToken,
  decryptToken,
  encryptTokenWithRing,
  decryptTokenWithRing,
  tokenFingerprint,
  LEGACY_KEY_VERSION,
  type EncryptedToken,
} from "./crypto.js";
import { parseKeyRing } from "../../lib/keyRing.js";

const VALID_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
// Distinct second key (v2) for rotation tests. gitleaks:allow — test fixture.
const KEY_V2 =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

/** Legacy single-key ring: current version = v1. */
const legacyRing = parseKeyRing({
  legacyKey: VALID_KEY,
  envName: "MONO_TOKEN_ENC_KEY",
})!;

/** Rotated ring: v1 (old) + v2 (new primary). */
const rotatedRing = parseKeyRing({
  keysCsv: `v1:${VALID_KEY},v2:${KEY_V2}`,
  currentVersion: "v2",
  envName: "MONO_TOKEN_ENC_KEY",
})!;

describe("crypto", () => {
  describe("encryptToken / decryptToken", () => {
    it("round-trips a token through encrypt then decrypt", () => {
      const token = "u7Qx_personal_test_token_abc123";
      const enc = encryptToken(token, VALID_KEY);

      expect(enc.ciphertext).toBeInstanceOf(Buffer);
      expect(enc.iv).toBeInstanceOf(Buffer);
      expect(enc.iv.length).toBe(12);
      expect(enc.tag).toBeInstanceOf(Buffer);
      expect(enc.tag.length).toBe(16);

      const decrypted = decryptToken(enc, VALID_KEY);
      expect(decrypted).toBe(token);
    });

    it("produces different ciphertext for the same plaintext (random IV)", () => {
      const token = "same_token";
      const enc1 = encryptToken(token, VALID_KEY);
      const enc2 = encryptToken(token, VALID_KEY);
      expect(enc1.iv.equals(enc2.iv)).toBe(false);
    });

    it("throws on wrong key during decryption", () => {
      const token = "secret_token_999";
      const enc = encryptToken(token, VALID_KEY);
      const wrongKey =
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
      expect(() => decryptToken(enc, wrongKey)).toThrow();
    });

    it("throws on tampered ciphertext", () => {
      const token = "tamper_test_token";
      const enc = encryptToken(token, VALID_KEY);
      enc!.ciphertext[0]! ^= 0xff;
      expect(() => decryptToken(enc, VALID_KEY)).toThrow();
    });

    it("throws on invalid key length", () => {
      expect(() => encryptToken("token", "tooshort")).toThrow(/64 hex chars/);
    });
  });

  // ─────────────── H4 Phase 2: KeyRing-aware crypto ───────────────
  describe("encryptTokenWithRing / decryptTokenWithRing", () => {
    it("round-trips under the primary key and stamps keyVersion", () => {
      const token = "ring_round_trip_token";
      const enc = encryptTokenWithRing(token, legacyRing);

      expect(enc.keyVersion).toBe(1);
      expect(enc.iv.length).toBe(12);
      expect(enc.tag.length).toBe(16);

      // Decrypt using the per-row version recorded above.
      expect(decryptTokenWithRing(enc, legacyRing, enc.keyVersion)).toBe(token);
    });

    it("legacy read: unversioned ciphertext (NULL token_key_version) decrypts as v1", () => {
      // Construct a LEGACY-format fixture exactly as the OLD code wrote it:
      // encryptToken(plaintext, hexKey) with NO version recorded anywhere.
      const token = "legacy_unversioned_token";
      const legacyEnc: EncryptedToken = encryptToken(token, VALID_KEY);
      expect(legacyEnc.keyVersion).toBeUndefined();

      // New decrypt path, given NULL row version (simulating the DB column),
      // MUST transparently read it under v1.
      expect(decryptTokenWithRing(legacyEnc, legacyRing, null)).toBe(token);
      expect(decryptTokenWithRing(legacyEnc, legacyRing, undefined)).toBe(
        token,
      );
      // And it equals LEGACY_KEY_VERSION semantics.
      expect(LEGACY_KEY_VERSION).toBe(1);
    });

    it("legacy ciphertext still decrypts under a ROTATED ring (v1+v2, current=v2)", () => {
      // The critical backward-compat guarantee: existing production rows
      // (written under v1) must keep decrypting after we add v2 as primary.
      const token = "prod_legacy_after_rotation";
      const legacyEnc: EncryptedToken = encryptToken(token, VALID_KEY);

      expect(decryptTokenWithRing(legacyEnc, rotatedRing, null)).toBe(token);
    });

    it("versioned read: v2 ciphertext decrypts under the rotated ring", () => {
      const token = "versioned_v2_token";
      const enc = encryptTokenWithRing(token, rotatedRing);
      expect(enc.keyVersion).toBe(2);

      expect(decryptTokenWithRing(enc, rotatedRing, enc.keyVersion)).toBe(
        token,
      );
    });

    it("rotation: new writes use v2, v1-encrypted data still decrypts", () => {
      const token = "rotation_token";

      // Data encrypted under v1 (old primary).
      const v1Enc = encryptTokenWithRing(token, legacyRing);
      expect(v1Enc.keyVersion).toBe(1);

      // After rotation, new writes use v2.
      const v2Enc = encryptTokenWithRing(token, rotatedRing);
      expect(v2Enc.keyVersion).toBe(2);

      // BOTH decrypt under the rotated ring using their own recorded version.
      expect(decryptTokenWithRing(v1Enc, rotatedRing, v1Enc.keyVersion)).toBe(
        token,
      );
      expect(decryptTokenWithRing(v2Enc, rotatedRing, v2Enc.keyVersion)).toBe(
        token,
      );

      // The v1 and v2 ciphertexts genuinely differ (different keys).
      expect(v1Enc.ciphertext.equals(v2Enc.ciphertext)).toBe(false);
    });

    it("fails closed when the recorded key version is absent from the ring", () => {
      const token = "orphaned_version_token";
      // Encrypt under v2, then try to decrypt with a v1-only ring (v2 retired).
      const enc = encryptTokenWithRing(token, rotatedRing);
      expect(() =>
        decryptTokenWithRing(enc, legacyRing, enc.keyVersion),
      ).toThrow(/key version v2 is not present/);
    });

    it("fails closed (throws) on tampered ciphertext, never returns wrong plaintext", () => {
      const token = "tamper_ring_token";
      const enc = encryptTokenWithRing(token, rotatedRing);
      enc.ciphertext[0]! ^= 0xff;
      expect(() =>
        decryptTokenWithRing(enc, rotatedRing, enc.keyVersion),
      ).toThrow();
    });

    it("fails closed on a tampered auth tag", () => {
      const token = "tamper_tag_token";
      const enc = encryptTokenWithRing(token, rotatedRing);
      enc.tag[0]! ^= 0xff;
      expect(() =>
        decryptTokenWithRing(enc, rotatedRing, enc.keyVersion),
      ).toThrow();
    });

    it("fails closed on garbage input (random bytes as ciphertext)", () => {
      const garbage: EncryptedToken = {
        ciphertext: Buffer.from("not real ciphertext at all", "utf8"),
        iv: Buffer.alloc(12, 7),
        tag: Buffer.alloc(16, 9),
        keyVersion: 2,
      };
      expect(() => decryptTokenWithRing(garbage, rotatedRing, 2)).toThrow();
    });
  });

  describe("tokenFingerprint", () => {
    it("returns a deterministic SHA-256 hex string", () => {
      const fp1 = tokenFingerprint("my_token");
      const fp2 = tokenFingerprint("my_token");
      expect(fp1).toBe(fp2);
      expect(fp1).toMatch(/^[0-9a-f]{64}$/);
    });

    it("produces different fingerprints for different tokens", () => {
      expect(tokenFingerprint("aaa")).not.toBe(tokenFingerprint("bbb"));
    });
  });
});
