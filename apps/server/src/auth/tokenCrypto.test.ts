import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import {
  decryptString,
  encryptString,
  isEncrypted,
  readKeyVersion,
} from "./tokenCrypto.js";
import { parseKeyRing } from "../lib/keyRing.js";

const KEY = "0".repeat(64);
const KEY_2 = crypto.randomBytes(32).toString("hex");

describe("tokenCrypto", () => {
  describe("encryptString / decryptString", () => {
    it("round-trips ASCII plaintext", () => {
      const ct = encryptString("hello world", KEY);
      expect(ct).not.toBe("hello world");
      expect(ct.startsWith("enc:v2:k1:")).toBe(true);
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
      const parts = ct.slice("enc:v2:".length).split(":");
      expect(parts).toHaveLength(4);
      const [versionLabel, ivHex, tagHex] = parts as [
        string,
        string,
        string,
        string,
      ];
      expect(versionLabel).toBe("k1");
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
      const parts = ct.slice("enc:v2:".length).split(":");
      const [version, iv, tag, body] = parts as [
        string,
        string,
        string,
        string,
      ];
      const flipped = (tag.slice(0, -1) +
        (tag.slice(-1) === "0" ? "1" : "0")) as string;
      const tampered = `enc:v2:${version}:${iv}:${flipped}:${body}`;
      expect(() => decryptString(tampered, KEY)).toThrow();
    });

    it("decrypt rejects a malformed ciphertext structure (v2)", () => {
      expect(() => decryptString("enc:v2:k1:notenoughparts", KEY)).toThrow(
        /invalid structure/,
      );
    });

    it("decrypt rejects a malformed iv (v2)", () => {
      expect(() =>
        decryptString(
          "enc:v2:k1:zz:00000000000000000000000000000000:AAAA",
          KEY,
        ),
      ).toThrow(/malformed/);
    });

    it("decrypt passes plaintext through unchanged when prefix is absent", () => {
      expect(decryptString("ya29.legacyaccesstoken", KEY)).toBe(
        "ya29.legacyaccesstoken",
      );
      expect(decryptString("", KEY)).toBe("");
    });

    it("decrypt accepts legacy enc:v1: rows (backwards-compat)", () => {
      const algo = "aes-256-gcm";
      const keyBuf = Buffer.from(KEY, "hex");
      const iv = Buffer.alloc(12, 0x42);
      const cipher = crypto.createCipheriv(algo, keyBuf, iv);
      const ct = Buffer.concat([
        cipher.update("legacy-token", "utf8"),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      const v1 = `enc:v1:${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("base64")}`;
      expect(decryptString(v1, KEY)).toBe("legacy-token");
    });
  });

  describe("multi-key rotation", () => {
    const HEX_A = "a".repeat(64);
    const HEX_B = "b".repeat(64);

    it("encrypts with current key version, decrypts mixed-version corpus", () => {
      const ringV1 = parseKeyRing({
        keysCsv: `v1:${HEX_A}`,
        currentVersion: null,
        legacyKey: null,
        envName: "BETTER_AUTH_TOKEN_ENC_KEY",
      })!;
      const ringBoth = parseKeyRing({
        keysCsv: `v1:${HEX_A},v2:${HEX_B}`,
        currentVersion: "v2",
        legacyKey: null,
        envName: "BETTER_AUTH_TOKEN_ENC_KEY",
      })!;

      const oldCt = encryptString("payload-1", ringV1);
      expect(oldCt.startsWith("enc:v2:k1:")).toBe(true);

      const newCt = encryptString("payload-2", ringBoth);
      expect(newCt.startsWith("enc:v2:k2:")).toBe(true);

      // post-rotation node decrypts both old (v1-encrypted) and new (v2)
      expect(decryptString(oldCt, ringBoth)).toBe("payload-1");
      expect(decryptString(newCt, ringBoth)).toBe("payload-2");
    });

    it("decrypt throws when key for recorded version is not in the ring", () => {
      const ringFull = parseKeyRing({
        keysCsv: `v1:${HEX_A},v2:${HEX_B}`,
        currentVersion: "v2",
        legacyKey: null,
        envName: "BETTER_AUTH_TOKEN_ENC_KEY",
      })!;
      const v2OnlyRing = parseKeyRing({
        keysCsv: `v2:${HEX_B}`,
        currentVersion: "v2",
        legacyKey: null,
        envName: "BETTER_AUTH_TOKEN_ENC_KEY",
      })!;

      const oldCt = encryptString("only-v1-can-read-me", {
        current: { version: 1, key: ringFull.byVersion.get(1)! },
        byVersion: new Map([[1, ringFull.byVersion.get(1)!]]),
        versions: [1],
      });
      expect(oldCt.startsWith("enc:v2:k1:")).toBe(true);

      // v1 was retired from env after rotation completed — should fail loudly
      expect(() => decryptString(oldCt, v2OnlyRing)).toThrow(
        /key version v1 is not present/,
      );
    });
  });

  describe("readKeyVersion", () => {
    it("returns null for plaintext / null / non-encrypted", () => {
      expect(readKeyVersion(null)).toBe(null);
      expect(readKeyVersion(undefined)).toBe(null);
      expect(readKeyVersion("ya29.plain")).toBe(null);
      expect(readKeyVersion("")).toBe(null);
    });

    it("returns 1 for legacy enc:v1: prefix", () => {
      expect(readKeyVersion("enc:v1:aa:bb:cc")).toBe(1);
    });

    it("returns the embedded version for enc:v2:kN: prefix", () => {
      const ct = encryptString("x", KEY);
      expect(readKeyVersion(ct)).toBe(1);
    });

    it("throws on a malformed v2 prefix", () => {
      expect(() => readKeyVersion("enc:v2:notakeylabel:iv:tag:ct")).toThrow(
        /malformed key-version segment/,
      );
    });
  });

  describe("isEncrypted", () => {
    it("recognises ciphertext (v2)", () => {
      expect(isEncrypted(encryptString("hello", KEY))).toBe(true);
    });

    it("recognises legacy v1 ciphertext", () => {
      expect(isEncrypted("enc:v1:aa:bb:cc")).toBe(true);
    });

    it("returns false for plaintext, null, and undefined", () => {
      expect(isEncrypted("ya29.plain")).toBe(false);
      expect(isEncrypted("")).toBe(false);
      expect(isEncrypted(null)).toBe(false);
      expect(isEncrypted(undefined)).toBe(false);
    });
  });
});
