import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../obs/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { incMock } = vi.hoisted(() => ({ incMock: vi.fn() }));
vi.mock("../../obs/metrics.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../obs/metrics.js")>();
  return {
    ...actual,
    monoTokenLazyReencryptTotal: { inc: incMock },
  };
});

import { parseKeyRing } from "../../lib/keyRing.js";
import {
  encryptToken,
  encryptTokenWithRing,
  decryptToken,
  type EncryptedToken,
} from "./crypto.js";
import {
  decryptAndLazyReencrypt,
  monoKeyRing,
  type MonoTokenRow,
} from "./tokenStore.js";

// gitleaks:allow — test fixtures, not real keys.
const KEY_V1 =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const KEY_V2 =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

const legacyRing = parseKeyRing({
  legacyKey: KEY_V1,
  envName: "MONO_TOKEN_ENC_KEY",
})!;
const rotatedRing = parseKeyRing({
  keysCsv: `v1:${KEY_V1},v2:${KEY_V2}`,
  currentVersion: "v2",
  envName: "MONO_TOKEN_ENC_KEY",
})!;

function rowFrom(enc: EncryptedToken, keyVersion: number | null): MonoTokenRow {
  return {
    token_ciphertext: enc.ciphertext,
    token_iv: enc.iv,
    token_tag: enc.tag,
    token_key_version: keyVersion,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("monoKeyRing", () => {
  it("builds a legacy v1 ring from a single key", () => {
    const ring = monoKeyRing({ legacyKey: KEY_V1 });
    expect(ring?.current.version).toBe(1);
  });

  it("builds a multi-key ring from keysCsv + currentVersion", () => {
    const ring = monoKeyRing({
      keysCsv: `v1:${KEY_V1},v2:${KEY_V2}`,
      currentVersion: "v2",
    });
    expect(ring?.current.version).toBe(2);
    expect(ring?.versions).toEqual([1, 2]);
  });

  it("returns null when nothing configured", () => {
    expect(monoKeyRing({})).toBeNull();
  });
});

describe("decryptAndLazyReencrypt", () => {
  it("decrypts a current-version row WITHOUT re-encrypting", async () => {
    const token = "current_version_token";
    const enc = encryptTokenWithRing(token, rotatedRing); // v2 = current
    const query = vi.fn();

    const result = await decryptAndLazyReencrypt(
      rowFrom(enc, enc.keyVersion),
      "user_1",
      rotatedRing,
      query,
    );

    expect(result).toBe(token);
    // No stale → no UPDATE, no metric.
    expect(query).not.toHaveBeenCalled();
    expect(incMock).not.toHaveBeenCalled();
  });

  it("legacy NULL-version row decrypts and triggers a versioned re-write", async () => {
    const token = "legacy_token_needing_reencrypt";
    // OLD format: encryptToken + NULL token_key_version in DB.
    const legacyEnc = encryptToken(token, KEY_V1);
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });

    const result = await decryptAndLazyReencrypt(
      rowFrom(legacyEnc, null),
      "user_42",
      rotatedRing,
      query,
    );

    expect(result).toBe(token);

    // Exactly one UPDATE, writing the new versioned ciphertext under v2.
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values, meta] = query.mock.calls[0]!;
    expect(sql).toMatch(/UPDATE mono_connection/);
    expect(meta?.op).toBe("mono_token_lazy_reencrypt");
    // values: [userId, ciphertext, iv, tag, keyVersion, oldCiphertext]
    expect(values[0]).toBe("user_42");
    expect(values[4]).toBe(2); // new key version
    // The persisted ciphertext must decrypt back to the token under v2's key.
    const rewritten: EncryptedToken = {
      ciphertext: values[1] as Buffer,
      iv: values[2] as Buffer,
      tag: values[3] as Buffer,
    };
    expect(decryptToken(rewritten, KEY_V2)).toBe(token);
    // Optimistic-lock guard matches the exact ciphertext we read.
    expect((values[5] as Buffer).equals(legacyEnc.ciphertext)).toBe(true);

    expect(incMock).toHaveBeenCalledWith({
      row_version: "legacy",
      outcome: "reencrypted",
    });
  });

  it("stale versioned row (v1 under rotated ring) re-encrypts to v2", async () => {
    const token = "v1_row_after_rotation";
    const v1Enc = encryptTokenWithRing(token, legacyRing); // version 1
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });

    const result = await decryptAndLazyReencrypt(
      rowFrom(v1Enc, 1),
      "user_7",
      rotatedRing,
      query,
    );

    expect(result).toBe(token);
    expect(query).toHaveBeenCalledTimes(1);
    expect(incMock).toHaveBeenCalledWith({
      row_version: "1",
      outcome: "reencrypted",
    });
  });

  it("a FAILING re-encrypt write does NOT throw and still returns plaintext", async () => {
    const token = "reencrypt_write_fails";
    const legacyEnc = encryptToken(token, KEY_V1);
    const query = vi.fn().mockRejectedValue(new Error("db down"));

    // MUST NOT throw — best-effort lazy migration.
    const result = await decryptAndLazyReencrypt(
      rowFrom(legacyEnc, null),
      "user_9",
      rotatedRing,
      query,
    );

    expect(result).toBe(token);
    expect(incMock).toHaveBeenCalledWith({
      row_version: "legacy",
      outcome: "reencrypt_failed",
    });
  });

  it("optimistic-lock miss (rowCount=0) is a silent no-op (concurrent writer won)", async () => {
    const token = "concurrent_race";
    const legacyEnc = encryptToken(token, KEY_V1);
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });

    const result = await decryptAndLazyReencrypt(
      rowFrom(legacyEnc, null),
      "user_race",
      rotatedRing,
      query,
    );

    expect(result).toBe(token);
    expect(query).toHaveBeenCalledTimes(1);
    // rowCount 0 → no "reencrypted" success metric.
    expect(incMock).not.toHaveBeenCalled();
  });

  it("fails closed (throws, no re-encrypt) on tampered ciphertext", async () => {
    const token = "tampered";
    const enc = encryptTokenWithRing(token, rotatedRing);
    enc.ciphertext[0]! ^= 0xff;
    const query = vi.fn();

    await expect(
      decryptAndLazyReencrypt(
        rowFrom(enc, enc.keyVersion),
        "u",
        rotatedRing,
        query,
      ),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it("fails closed when the row's key version was retired from the ring", async () => {
    const token = "retired_version";
    const v2Enc = encryptTokenWithRing(token, rotatedRing); // v2
    const query = vi.fn();

    // legacyRing only has v1 — v2 key was removed.
    await expect(
      decryptAndLazyReencrypt(rowFrom(v2Enc, 2), "u", legacyRing, query),
    ).rejects.toThrow(/key version v2 is not present/);
    expect(query).not.toHaveBeenCalled();
  });
});
