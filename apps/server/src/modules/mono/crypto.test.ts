import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken, tokenFingerprint } from "./crypto.js";

const VALID_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

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
