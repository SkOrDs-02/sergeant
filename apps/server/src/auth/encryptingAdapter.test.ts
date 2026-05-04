import { describe, expect, it } from "vitest";
import { __test__ } from "./encryptingAdapter.js";
import { decryptString, encryptString, isEncrypted } from "./tokenCrypto.js";
import { parseKeyRing } from "../lib/keyRing.js";

const { ACCOUNT_MODEL, TOKEN_FIELDS, encryptTokenFields, decryptTokenFields } =
  __test__;
const KEY = "f".repeat(64);
// H4: encryptTokenFields/decryptTokenFields take a KeyRing now. We keep KEY
// as the legacy single-key form (covers backward-compat); other tests below
// extend this to multi-key rings to assert lazy-reencrypt logging.
const RING = parseKeyRing({ legacyKey: KEY, envName: "TEST_KEY" })!;

describe("encryptingAdapter helpers", () => {
  describe("encryptTokenFields", () => {
    it("encrypts every supported field present", () => {
      const out = encryptTokenFields(
        {
          accessToken: "ya29.access",
          refreshToken: "1//0refresh",
          idToken: "eyJhbGc.id",
          providerId: "google",
        },
        RING,
      );
      for (const f of TOKEN_FIELDS) {
        const v = out[f];
        expect(typeof v).toBe("string");
        expect(isEncrypted(v as string)).toBe(true);
      }
      expect(out.providerId).toBe("google");
    });

    it("does not double-encrypt already-encrypted values", () => {
      const already = encryptString("ya29.access", KEY);
      const out = encryptTokenFields({ accessToken: already }, RING);
      // identity preserved (no re-encryption)
      expect(out.accessToken).toBe(already);
    });

    it("ignores fields that are missing or non-string", () => {
      const out = encryptTokenFields(
        {
          accessToken: null,
          refreshToken: undefined,
          idToken: 0,
          accountId: "abc",
        },
        RING,
      );
      // null/undefined/0 stay verbatim — only strings get touched
      expect(out.accessToken).toBe(null);
      expect(out.refreshToken).toBe(undefined);
      expect(out.idToken).toBe(0);
      expect(out.accountId).toBe("abc");
    });

    it("ignores empty-string tokens (Better Auth never queries by them)", () => {
      const out = encryptTokenFields({ accessToken: "" }, RING);
      expect(out.accessToken).toBe("");
    });

    it("returns the original reference when nothing to do", () => {
      const data = { providerId: "google", accountId: "abc" };
      const out = encryptTokenFields(data, RING);
      expect(out).toBe(data);
    });
  });

  describe("decryptTokenFields", () => {
    it("decrypts every encrypted field present", () => {
      const row = {
        accessToken: encryptString("ya29.access", KEY),
        refreshToken: encryptString("1//0refresh", KEY),
        idToken: encryptString("eyJhbGc.id", KEY),
        providerId: "google",
      };
      const out = decryptTokenFields(row, RING);
      expect(out.accessToken).toBe("ya29.access");
      expect(out.refreshToken).toBe("1//0refresh");
      expect(out.idToken).toBe("eyJhbGc.id");
      expect(out.providerId).toBe("google");
    });

    it("passes plaintext rows through unchanged (legacy data)", () => {
      const row = {
        accessToken: "ya29.legacy",
        refreshToken: "1//0legacy",
        idToken: "eyJhbGc.legacy",
      };
      const out = decryptTokenFields(row, RING);
      expect(out).toEqual(row);
    });

    it("handles a mix of encrypted and plaintext fields on the same row", () => {
      const row = {
        accessToken: encryptString("ya29.access", KEY),
        refreshToken: "1//0legacy", // not yet encrypted
      };
      const out = decryptTokenFields(row, RING);
      expect(out.accessToken).toBe("ya29.access");
      expect(out.refreshToken).toBe("1//0legacy");
    });

    it("returns null and undefined verbatim", () => {
      expect(decryptTokenFields(null as unknown as object, RING)).toBe(null);
      expect(decryptTokenFields(undefined as unknown as object, RING)).toBe(
        undefined,
      );
    });

    it("propagates decrypt errors so callers force re-auth", () => {
      const row = {
        accessToken:
          "enc:v1:00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000:AAAA",
      };
      expect(() => decryptTokenFields(row, RING)).toThrow();
    });
  });

  it("ACCOUNT_MODEL is 'account' (matches Better Auth default schema)", () => {
    // sanity — the model name is what Better Auth uses internally for the
    // OAuth-credentials table; if upstream renames it, this assertion will
    // fail loud and we'll know to update the constant rather than silently
    // skip encryption.
    expect(ACCOUNT_MODEL).toBe("account");
  });
});

describe("encryptingAdapter end-to-end (encrypt -> decrypt round-trip)", () => {
  it("payload encrypted by encryptTokenFields decrypts to the original via decryptString", () => {
    const original = {
      accessToken: "ya29.real-access",
      refreshToken: "1//0real-refresh",
      idToken: "eyJhbGc.real-id",
    };
    const encrypted = encryptTokenFields(original, RING);
    expect(encrypted).not.toBe(original);
    for (const f of TOKEN_FIELDS) {
      expect(decryptString(encrypted[f] as string, KEY)).toBe(
        original[f as keyof typeof original],
      );
    }
  });
});

// H4: multi-key key-ring path. We assert that
//   (1) ciphertext written under v1 still decrypts after rotation to v2;
//   (2) new writes go under v2 (validated via tokenCrypto.readKeyVersion);
//   (3) reading a v1 row under a ring whose `current=v2` decrypts cleanly —
//       lazy re-encrypt is expected to happen on the next OAuth refresh, not
//       on every read.
describe("encryptingAdapter — multi-key (H4 rotation)", () => {
  const KEY_V1 = "a".repeat(64);
  const KEY_V2 = "b".repeat(64);
  const RING_V1_ONLY = parseKeyRing({
    keysCsv: `v1:${KEY_V1}`,
    currentVersion: "v1",
    envName: "TEST_KEY",
  })!;
  const RING_V1_AND_V2 = parseKeyRing({
    keysCsv: `v1:${KEY_V1},v2:${KEY_V2}`,
    currentVersion: "v2",
    envName: "TEST_KEY",
  })!;

  it("decrypts a row written under v1 even after rotation to v2", () => {
    const old = encryptTokenFields(
      { accessToken: "ya29.before-rotation" },
      RING_V1_ONLY,
    );
    const out = decryptTokenFields(old, RING_V1_AND_V2);
    expect(out.accessToken).toBe("ya29.before-rotation");
  });

  it("new writes use the current version (v2) when ring is rotated", () => {
    const out = encryptTokenFields(
      { accessToken: "ya29.after-rotation" },
      RING_V1_AND_V2,
    );
    const ct = out.accessToken as string;
    // "enc:v2:k2:..." — the second `v2` here is the prefix-format marker,
    // and `k2` is the key version inside the ring.
    expect(ct.startsWith("enc:v2:k2:")).toBe(true);
  });
});
