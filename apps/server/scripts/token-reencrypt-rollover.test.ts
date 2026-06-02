/** @vitest-environment node */
import { describe, it, expect } from "vitest";
import {
  parseCliArgs,
  planRowRollover,
  accumulatePlan,
  newCounters,
  formatReport,
  type AccountRow,
} from "./token-reencrypt-rollover.js";
import {
  decryptString,
  encryptString,
  isEncrypted,
} from "../src/auth/tokenCrypto.js";
import type { KeyRing } from "../src/lib/keyRing.js";

/**
 * Unit tests for pure functions inside the reencrypt-tokens CLI. Tests do
 * NOT touch the DB — `main()` is integration-shaped and tested manually
 * against a dev account table.
 *
 * Token plaintexts in fixtures are deliberately short / synthetic; they are
 * never logged or asserted on (only their encrypted form is compared).
 */

function makeRing(versions: ReadonlyArray<number>): KeyRing {
  // Deterministic 32-byte buffers per version so tests are repeatable.
  const byVersion = new Map<number, Buffer>();
  for (const v of versions) {
    const buf = Buffer.alloc(32);
    buf.fill(v % 256);
    byVersion.set(v, buf);
  }
  const currentVersion = Math.max(...versions);
  return {
    current: { version: currentVersion, key: byVersion.get(currentVersion)! },
    byVersion,
    versions: [...versions].sort((a, b) => a - b),
  };
}

describe("parseCliArgs", () => {
  it("returns defaults when no flags passed", () => {
    const r = parseCliArgs([]);
    expect(r.error).toBeUndefined();
    expect(r.parsed?.execute).toBe(false);
    expect(r.parsed?.batchSize).toBe(200);
    expect(r.parsed?.maxRows).toBe(10000);
    expect(r.parsed?.verbose).toBe(false);
    expect(r.parsed?.help).toBe(false);
  });

  it("--execute flips execute=true", () => {
    expect(parseCliArgs(["--execute"]).parsed?.execute).toBe(true);
  });

  it("--batch-size accepts integer in [1..1000]", () => {
    expect(parseCliArgs(["--batch-size=500"]).parsed?.batchSize).toBe(500);
    expect(parseCliArgs(["--batch-size=1"]).parsed?.batchSize).toBe(1);
    expect(parseCliArgs(["--batch-size=1000"]).parsed?.batchSize).toBe(1000);
  });

  it("--batch-size rejects 0, negative, > 1000, non-int", () => {
    expect(parseCliArgs(["--batch-size=0"]).error).toMatch(/batch-size/);
    expect(parseCliArgs(["--batch-size=-5"]).error).toMatch(/batch-size/);
    expect(parseCliArgs(["--batch-size=1001"]).error).toMatch(/batch-size/);
    expect(parseCliArgs(["--batch-size=foo"]).error).toMatch(/batch-size/);
    expect(parseCliArgs(["--batch-size=1.5"]).error).toMatch(/batch-size/);
  });

  it("--max-rows accepts any positive integer (no upper bound)", () => {
    expect(parseCliArgs(["--max-rows=1"]).parsed?.maxRows).toBe(1);
    expect(parseCliArgs(["--max-rows=999999"]).parsed?.maxRows).toBe(999999);
  });

  it("--max-rows rejects 0, negative, non-int", () => {
    expect(parseCliArgs(["--max-rows=0"]).error).toMatch(/max-rows/);
    expect(parseCliArgs(["--max-rows=-1"]).error).toMatch(/max-rows/);
    expect(parseCliArgs(["--max-rows=abc"]).error).toMatch(/max-rows/);
  });

  it("--help short-circuits other validation", () => {
    expect(parseCliArgs(["--help"]).parsed?.help).toBe(true);
    expect(parseCliArgs(["-h"]).parsed?.help).toBe(true);
  });
});

describe("planRowRollover", () => {
  it("returns empty rekeys for null/empty token fields", () => {
    const ring = makeRing([1, 2]);
    const plan = planRowRollover(
      {
        id: "acc_1",
        accessToken: null,
        refreshToken: null,
        idToken: null,
      } as AccountRow,
      ring,
    );
    expect(plan.rowId).toBe("acc_1");
    expect(plan.rekeys).toEqual([]);
  });

  it("skips plaintext (pre-encrypting-adapter rows)", () => {
    const ring = makeRing([1, 2]);
    const plan = planRowRollover(
      {
        id: "acc_legacy",
        accessToken: "ya29.plain-google-token",
        refreshToken: null,
        idToken: null,
      } as AccountRow,
      ring,
    );
    expect(plan.rekeys).toEqual([]);
  });

  it("skips ciphertext already under current key version", () => {
    const ring = makeRing([1, 2]);
    const ringV1Only: KeyRing = {
      current: { version: 2, key: ring.byVersion.get(2)! },
      byVersion: ring.byVersion,
      versions: ring.versions,
    };
    const fresh = encryptString("hello", ringV1Only); // → v2 (current)
    const plan = planRowRollover(
      {
        id: "acc_current",
        accessToken: fresh,
        refreshToken: null,
        idToken: null,
      } as AccountRow,
      ringV1Only,
    );
    expect(plan.rekeys).toEqual([]);
  });

  it("re-encrypts ciphertext under stale key version", () => {
    const ring = makeRing([1, 2]);
    // First encrypt under v1 by giving encryptString a v1-only ring.
    const v1OnlyRing: KeyRing = {
      current: { version: 1, key: ring.byVersion.get(1)! },
      byVersion: new Map([[1, ring.byVersion.get(1)!]]),
      versions: [1],
    };
    const oldCt = encryptString("secret-access", v1OnlyRing);
    expect(isEncrypted(oldCt)).toBe(true);

    // Now plan with the multi-key ring whose current is v2.
    const plan = planRowRollover(
      {
        id: "acc_stale",
        accessToken: oldCt,
        refreshToken: null,
        idToken: null,
      } as AccountRow,
      ring,
    );
    expect(plan.rekeys).toHaveLength(1);
    expect(plan.rekeys[0]?.field).toBe("accessToken");
    expect(plan.rekeys[0]?.oldVersion).toBe(1);
    expect(plan.rekeys[0]?.oldCiphertext).toBe(oldCt);
    // New ciphertext must be different from old (different IV at minimum)
    expect(plan.rekeys[0]?.newCiphertext).not.toBe(oldCt);
    // And must parse as v2
    expect(plan.rekeys[0]?.newCiphertext.startsWith("enc:v2:k2:")).toBe(true);
  });

  it("handles all three token fields independently", () => {
    const ring = makeRing([1, 2]);
    const v1OnlyRing: KeyRing = {
      current: { version: 1, key: ring.byVersion.get(1)! },
      byVersion: new Map([[1, ring.byVersion.get(1)!]]),
      versions: [1],
    };
    const plan = planRowRollover(
      {
        id: "acc_all",
        accessToken: encryptString("access", v1OnlyRing),
        refreshToken: encryptString("refresh", v1OnlyRing),
        idToken: encryptString("id", v1OnlyRing),
      } as AccountRow,
      ring,
    );
    expect(plan.rekeys.map((r) => r.field).sort()).toEqual([
      "accessToken",
      "idToken",
      "refreshToken",
    ]);
  });

  it("mixed-version row: only stale fields rekeyed", () => {
    const ring = makeRing([1, 2]);
    const v1Only: KeyRing = {
      current: { version: 1, key: ring.byVersion.get(1)! },
      byVersion: new Map([[1, ring.byVersion.get(1)!]]),
      versions: [1],
    };
    const v2Only: KeyRing = {
      current: { version: 2, key: ring.byVersion.get(2)! },
      byVersion: new Map([[2, ring.byVersion.get(2)!]]),
      versions: [2],
    };
    const plan = planRowRollover(
      {
        id: "acc_mixed",
        accessToken: encryptString("a", v2Only), // current, skip
        refreshToken: encryptString("r", v1Only), // stale, rekey
        idToken: null,
      } as AccountRow,
      ring,
    );
    expect(plan.rekeys).toHaveLength(1);
    expect(plan.rekeys[0]?.field).toBe("refreshToken");
  });

  it("decrypts-then-re-encrypts produces equivalent plaintext (roundtrip)", () => {
    const ring = makeRing([1, 2]);
    const v1Only: KeyRing = {
      current: { version: 1, key: ring.byVersion.get(1)! },
      byVersion: new Map([[1, ring.byVersion.get(1)!]]),
      versions: [1],
    };
    const plaintext = "ya29.legit-google-access-token";
    const oldCt = encryptString(plaintext, v1Only);
    const plan = planRowRollover(
      {
        id: "acc_rt",
        accessToken: oldCt,
        refreshToken: null,
        idToken: null,
      } as AccountRow,
      ring,
    );
    // Re-decrypt the new ciphertext under the ring; must equal original plaintext.
    expect(decryptString(plan.rekeys[0]!.newCiphertext, ring)).toBe(plaintext);
  });
});

describe("accumulatePlan + counters", () => {
  it("counts rows scanned even when nothing to rekey", () => {
    const c = newCounters();
    accumulatePlan(c, { rowId: "x", rekeys: [] });
    accumulatePlan(c, { rowId: "y", rekeys: [] });
    expect(c.rowsScanned).toBe(2);
    expect(c.rowsNeedingRekey).toBe(0);
    expect(c.fieldsRewritten).toBe(0);
  });

  it("groups field counts by old version", () => {
    const c = newCounters();
    accumulatePlan(c, {
      rowId: "a",
      rekeys: [
        {
          field: "accessToken",
          oldVersion: 1,
          newCiphertext: "x",
          oldCiphertext: "y",
        },
        {
          field: "refreshToken",
          oldVersion: 1,
          newCiphertext: "x",
          oldCiphertext: "y",
        },
      ],
    });
    accumulatePlan(c, {
      rowId: "b",
      rekeys: [
        {
          field: "idToken",
          oldVersion: 2,
          newCiphertext: "x",
          oldCiphertext: "y",
        },
      ],
    });
    expect(c.rowsScanned).toBe(2);
    expect(c.rowsNeedingRekey).toBe(2);
    expect(c.fieldsRewritten).toBe(3);
    expect(c.byOldVersion.get(1)).toBe(2);
    expect(c.byOldVersion.get(2)).toBe(1);
  });
});

describe("formatReport", () => {
  it("dry-run mode does not show updated/failed", () => {
    const c = newCounters();
    c.rowsScanned = 100;
    c.rowsNeedingRekey = 20;
    const txt = formatReport(c, "dry-run");
    expect(txt).toMatch(/Mode: dry-run/);
    expect(txt).toMatch(/Rows scanned:\s+100/);
    expect(txt).not.toMatch(/Rows updated/);
    expect(txt).not.toMatch(/Rows failed/);
  });

  it("execute mode includes updated + failed", () => {
    const c = newCounters();
    c.rowsScanned = 50;
    c.rowsNeedingRekey = 10;
    c.rowsUpdated = 9;
    c.rowsFailed = 1;
    const txt = formatReport(c, "execute");
    expect(txt).toMatch(/Mode: execute/);
    expect(txt).toMatch(/Rows updated:\s+9/);
    expect(txt).toMatch(/Rows failed:\s+1/);
  });

  it("renders per-version section only when byOldVersion has entries", () => {
    const c = newCounters();
    c.rowsScanned = 0;
    const empty = formatReport(c, "dry-run");
    expect(empty).not.toMatch(/By old key version/);
    c.byOldVersion.set(1, 5);
    const withVer = formatReport(c, "dry-run");
    expect(withVer).toMatch(/By old key version/);
    expect(withVer).toMatch(/v1.*5 field/);
  });
});
