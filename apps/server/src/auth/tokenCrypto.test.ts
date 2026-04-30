import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { decryptString, encryptString, isEncrypted } from "./tokenCrypto.js";

const KEY = "0".repeat(64);
const KEY_2 = crypto.randomBytes(32).toString("hex");

describe("tokenCrypto", () => {
  describe("encryptString / decryptString", () => {
    it("round-trips ASCII plaintext", () => {
      const ct = encryptString("hello world", KEY);
      expect(ct).not.toBe("hello world");
      expect(ct.startsWith("enc:v1:")).toBe(true);
      expect(decryptString(ct, KEY)).toBe("hello world");
    });

    it("round-trips Unicode plaintext", () => {
      const plain = "🔐 секрет — 1234";
      const ct = encryptString(plain, KEY);
      expect(decryptString(ct, KEY)).toBe(plain);
    });

    it("round-trips empty-ish but non-empty strings", () => {
      const plain = " ";
      const ct = encryptString(plain, KEY);
      expect(decryptString(ct, KEY)).toBe(plain);
    });

    it("round-trips long plaintext (4 KB)", () => {
      const plain = "a".repeat(4096);
      const ct = encryptString(plain, KEY);
      expect(decryptString(ct, KEY)).toBe(plain);
    });

    it("produces different ciphertexts for the same plaintext (random IV)", () => {
      const a = encryptString("same", KEY);
      const b = encryptString("same", KEY);
      expect(a).not.toBe(b);
      expect(decryptString(a, KEY)).toBe("same");
      expect(decryptString(b, KEY)).toBe("same");
    });

    it("uses a 12-byte IV and 16-byte tag", () => {
      const ct = encryptString("x", KEY);
      const parts = ct.slice("enc:v1:".length).split(":");
      expect(parts).toHaveLength(3);
      const [ivHex, tagHex] = parts as [string, string, string];
      expect(ivHex.length).toBe(24); // 12 bytes -> 24 hex
      expect(tagHex.length).toBe(32); // 16 bytes -> 32 hex
    });

    it("rejects an invalid (too-short) key", () => {
      expect(() => encryptString("x", "abc")).toThrow(/64 hex chars/);
    });

    it("rejects a non-hex key", () => {
      expect(() => encryptString("x", "z".repeat(64))).toThrow(/64 hex chars/);
    });

    it("decrypt fails when the wrong key is used", () => {
      const ct = encryptString("secret", KEY);
      expect(() => decryptString(ct, KEY_2)).toThrow();
    });

    it("decrypt fails when the auth tag is tampered with", () => {
      const ct = encryptString("secret", KEY);
      // Flip last char of the tag (positions: enc:v1:<iv>:<tag>:<ct>)
      const parts = ct.slice("enc:v1:".length).split(":");
      const [iv, tag, body] = parts as [string, string, string];
      const flipped = (tag.slice(0, -1) +
        (tag.slice(-1) === "0" ? "1" : "0")) as string;
      const tampered = `enc:v1:${iv}:${flipped}:${body}`;
      expect(() => decryptString(tampered, KEY)).toThrow();
    });

    it("decrypt rejects a malformed ciphertext structure", () => {
      expect(() => decryptString("enc:v1:notenoughparts", KEY)).toThrow(
        /invalid structure/,
      );
    });

    it("decrypt rejects a malformed iv", () => {
      expect(() =>
        decryptString("enc:v1:zz:00000000000000000000000000000000:AAAA", KEY),
      ).toThrow(/malformed/);
    });

    it("decrypt passes plaintext through unchanged when prefix is absent", () => {
      // legacy rows that exist before this code shipped
      expect(decryptString("ya29.legacyaccesstoken", KEY)).toBe(
        "ya29.legacyaccesstoken",
      );
      expect(decryptString("", KEY)).toBe("");
    });
  });

  describe("isEncrypted", () => {
    it("recognises ciphertext", () => {
      expect(isEncrypted(encryptString("hello", KEY))).toBe(true);
    });

    it("returns false for plaintext, null, and undefined", () => {
      expect(isEncrypted("ya29.plain")).toBe(false);
      expect(isEncrypted("")).toBe(false);
      expect(isEncrypted(null)).toBe(false);
      expect(isEncrypted(undefined)).toBe(false);
    });
  });
});
