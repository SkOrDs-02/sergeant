import { describe, it, expect } from "vitest";
import { parseKeyRing, keyRingFromEnv, getKeyForVersion } from "./keyRing.js";

const HEX_64_A = "a".repeat(64);
const HEX_64_B = "b".repeat(64);
const HEX_64_C = "c".repeat(64);

describe("parseKeyRing", () => {
  describe("multi-key CSV format", () => {
    it("parses single v1 entry", () => {
      const ring = parseKeyRing({
        keysCsv: `v1:${HEX_64_A}`,
        currentVersion: null,
        legacyKey: null,
        envName: "MONO_TOKEN_ENC_KEY",
      });
      expect(ring).not.toBeNull();
      expect(ring!.current.version).toBe(1);
      expect(ring!.current.key.toString("hex")).toBe(HEX_64_A);
      expect(ring!.versions).toEqual([1]);
    });

    it("parses two entries and defaults current to highest version", () => {
      const ring = parseKeyRing({
        keysCsv: `v1:${HEX_64_A},v2:${HEX_64_B}`,
        currentVersion: null,
        legacyKey: null,
        envName: "MONO_TOKEN_ENC_KEY",
      });
      expect(ring!.current.version).toBe(2);
      expect(ring!.current.key.toString("hex")).toBe(HEX_64_B);
      expect(ring!.versions).toEqual([1, 2]);
    });

    it("respects explicit current version even when not the highest", () => {
      const ring = parseKeyRing({
        keysCsv: `v1:${HEX_64_A},v2:${HEX_64_B}`,
        currentVersion: "v1",
        legacyKey: null,
        envName: "MONO_TOKEN_ENC_KEY",
      });
      expect(ring!.current.version).toBe(1);
      expect(ring!.current.key.toString("hex")).toBe(HEX_64_A);
    });

    it("trims whitespace inside CSV pairs", () => {
      const ring = parseKeyRing({
        keysCsv: `  v1: ${HEX_64_A}  ,  v2:${HEX_64_B}  `,
        currentVersion: " v2 ",
        legacyKey: null,
        envName: "MONO_TOKEN_ENC_KEY",
      });
      expect(ring!.current.version).toBe(2);
      expect(ring!.versions).toEqual([1, 2]);
    });

    it("supports non-contiguous version numbers (v1 + v5)", () => {
      const ring = parseKeyRing({
        keysCsv: `v1:${HEX_64_A},v5:${HEX_64_C}`,
        currentVersion: null,
        legacyKey: null,
        envName: "MONO_TOKEN_ENC_KEY",
      });
      expect(ring!.current.version).toBe(5);
      expect(ring!.versions).toEqual([1, 5]);
    });

    it("rejects duplicate version", () => {
      expect(() =>
        parseKeyRing({
          keysCsv: `v1:${HEX_64_A},v1:${HEX_64_B}`,
          currentVersion: null,
          legacyKey: null,
          envName: "MONO_TOKEN_ENC_KEY",
        }),
      ).toThrow(/duplicate version v1/);
    });

    it("rejects malformed pair without colon", () => {
      expect(() =>
        parseKeyRing({
          keysCsv: `v1${HEX_64_A}`,
          currentVersion: null,
          legacyKey: null,
          envName: "MONO_TOKEN_ENC_KEY",
        }),
      ).toThrow(/malformed entry/);
    });

    it("rejects bad version label", () => {
      expect(() =>
        parseKeyRing({
          keysCsv: `version1:${HEX_64_A}`,
          currentVersion: null,
          legacyKey: null,
          envName: "MONO_TOKEN_ENC_KEY",
        }),
      ).toThrow(/invalid version label/);
    });

    it("rejects non-hex key", () => {
      expect(() =>
        parseKeyRing({
          keysCsv: `v1:not-hex-not-64-chars`,
          currentVersion: null,
          legacyKey: null,
          envName: "MONO_TOKEN_ENC_KEY",
        }),
      ).toThrow(/64 hex chars/);
    });

    it("rejects current_version pointing to an unknown version", () => {
      expect(() =>
        parseKeyRing({
          keysCsv: `v1:${HEX_64_A}`,
          currentVersion: "v3",
          legacyKey: null,
          envName: "MONO_TOKEN_ENC_KEY",
        }),
      ).toThrow(/v3 is not in MONO_TOKEN_ENC_KEYS/);
    });

    it("rejects malformed current_version label", () => {
      expect(() =>
        parseKeyRing({
          keysCsv: `v1:${HEX_64_A}`,
          currentVersion: "latest",
          legacyKey: null,
          envName: "MONO_TOKEN_ENC_KEY",
        }),
      ).toThrow(/invalid version label/);
    });
  });

  describe("legacy single-key fallback", () => {
    it("returns v1 ring when only legacy key is set", () => {
      const ring = parseKeyRing({
        keysCsv: null,
        currentVersion: null,
        legacyKey: HEX_64_A,
        envName: "MONO_TOKEN_ENC_KEY",
      });
      expect(ring!.current.version).toBe(1);
      expect(ring!.current.key.toString("hex")).toBe(HEX_64_A);
      expect(ring!.versions).toEqual([1]);
    });

    it("ignores legacy key when CSV is set", () => {
      const ring = parseKeyRing({
        keysCsv: `v2:${HEX_64_B}`,
        currentVersion: null,
        legacyKey: HEX_64_A,
        envName: "MONO_TOKEN_ENC_KEY",
      });
      expect(ring!.current.version).toBe(2);
      expect(ring!.current.key.toString("hex")).toBe(HEX_64_B);
    });

    it("rejects malformed legacy key", () => {
      expect(() =>
        parseKeyRing({
          keysCsv: null,
          currentVersion: null,
          legacyKey: "short",
          envName: "MONO_TOKEN_ENC_KEY",
        }),
      ).toThrow(/MONO_TOKEN_ENC_KEY: must be exactly 64 hex chars/);
    });
  });

  describe("empty inputs", () => {
    it("returns null when nothing is set", () => {
      expect(
        parseKeyRing({
          keysCsv: null,
          currentVersion: null,
          legacyKey: null,
          envName: "MONO_TOKEN_ENC_KEY",
        }),
      ).toBeNull();
    });

    it("returns null when all inputs are empty strings or whitespace", () => {
      expect(
        parseKeyRing({
          keysCsv: "   ",
          currentVersion: "   ",
          legacyKey: "   ",
          envName: "MONO_TOKEN_ENC_KEY",
        }),
      ).toBeNull();
    });

    it("rejects CSV that parses to empty list (only commas/spaces)", () => {
      expect(() =>
        parseKeyRing({
          keysCsv: " , , ",
          currentVersion: null,
          legacyKey: null,
          envName: "MONO_TOKEN_ENC_KEY",
        }),
      ).toThrow(/parsed to empty list/);
    });
  });
});

describe("keyRingFromEnv", () => {
  it("reads multi-key from process.env-style object", () => {
    const env: NodeJS.ProcessEnv = {
      MONO_TOKEN_ENC_KEYS: `v1:${HEX_64_A},v2:${HEX_64_B}`,
      MONO_TOKEN_ENC_KEY_CURRENT_VERSION: "v2",
    };
    const ring = keyRingFromEnv(env, "MONO_TOKEN_ENC_KEY");
    expect(ring!.current.version).toBe(2);
    expect(ring!.versions).toEqual([1, 2]);
  });

  it("falls back to legacy single-key var", () => {
    const env: NodeJS.ProcessEnv = {
      MONO_TOKEN_ENC_KEY: HEX_64_A,
    };
    const ring = keyRingFromEnv(env, "MONO_TOKEN_ENC_KEY");
    expect(ring!.current.version).toBe(1);
    expect(ring!.current.key.toString("hex")).toBe(HEX_64_A);
  });

  it("returns null when no relevant env-vars are set", () => {
    expect(keyRingFromEnv({}, "MONO_TOKEN_ENC_KEY")).toBeNull();
  });
});

describe("getKeyForVersion", () => {
  const ring = parseKeyRing({
    keysCsv: `v1:${HEX_64_A},v2:${HEX_64_B}`,
    currentVersion: "v2",
    legacyKey: null,
    envName: "MONO_TOKEN_ENC_KEY",
  })!;

  it("returns the key for a known version", () => {
    expect(getKeyForVersion(ring, 1).toString("hex")).toBe(HEX_64_A);
    expect(getKeyForVersion(ring, 2).toString("hex")).toBe(HEX_64_B);
  });

  it("throws for unknown version (key revoked from env)", () => {
    expect(() => getKeyForVersion(ring, 99)).toThrow(
      /key version v99 is not present in key-ring/,
    );
  });
});
