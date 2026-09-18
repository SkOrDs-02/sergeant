import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

import {
  __readRawCredForTests,
  __seedLegacyCredForTests,
  CURRENT_PBKDF2_ITERATIONS,
  LATEST_CRED_VERSION,
  clearPinHash,
  hasPinSet,
  savePinHash,
  verifyPin,
  verifyPinAttempt,
  MAX_FAILED_UNLOCK_ATTEMPTS,
} from "./lockStorage";

const originalIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;

function installFakeIDB(): IDBFactory {
  const factory = new IDBFactory();
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = factory;
  return factory;
}

function uninstallIDB() {
  (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
}

describe("lockStorage", () => {
  beforeEach(() => {
    installFakeIDB();
  });

  afterEach(async () => {
    // Wipe the fake DB so each test starts clean.
    await clearPinHash().catch(() => {});
    uninstallIDB();
    vi.restoreAllMocks();
  });

  it("hasPinSet returns false when no PIN has been saved", async () => {
    expect(await hasPinSet()).toBe(false);
  });

  it("savePinHash + hasPinSet returns true", async () => {
    await savePinHash("1234");
    expect(await hasPinSet()).toBe(true);
  });

  it("verifyPin succeeds with the correct PIN", async () => {
    await savePinHash("9876");
    expect(await verifyPin("9876")).toBe(true);
  });

  it("verifyPin fails with a wrong PIN", async () => {
    await savePinHash("9876");
    expect(await verifyPin("0000")).toBe(false);
  });

  it("verifyPin returns false when no PIN is set", async () => {
    expect(await verifyPin("1234")).toBe(false);
  });

  it("clearPinHash removes the stored credential", async () => {
    await savePinHash("5555");
    await clearPinHash();
    expect(await hasPinSet()).toBe(false);
  });

  it("two saves with the same PIN still verify correctly (different salts)", async () => {
    await savePinHash("1234");
    // Overwrite — should still verify with the same PIN.
    await savePinHash("1234");
    expect(await verifyPin("1234")).toBe(true);
  });

  describe("F16 — per-user credential partitioning", () => {
    it("a PIN saved for one user is invisible to another user (and to anon)", async () => {
      await savePinHash("1234", "user-a");
      expect(await hasPinSet("user-a")).toBe(true);
      expect(await hasPinSet("user-b")).toBe(false);
      expect(await hasPinSet(null)).toBe(false);
    }, 15_000);

    it("verifyPin only matches within the same user partition", async () => {
      await savePinHash("1234", "user-a");
      expect(await verifyPin("1234", "user-a")).toBe(true);
      // Wrong partition → no credential there → never matches (no derive).
      expect(await verifyPin("1234", "user-b")).toBe(false);
    }, 15_000);

    it("clearPinHash only clears the targeted user's partition", async () => {
      await savePinHash("1234", "user-a");
      await savePinHash("5678", "user-b");
      await clearPinHash("user-a");
      expect(await hasPinSet("user-a")).toBe(false);
      expect(await hasPinSet("user-b")).toBe(true);
      expect(await verifyPin("5678", "user-b")).toBe(true);
    }, 30_000);

    it("anon (signed-out) slot is independent of any user slot", async () => {
      await savePinHash("0000"); // default → anon
      await savePinHash("1111", "user-a");
      expect(await verifyPin("0000", null)).toBe(true);
      expect(await verifyPin("0000", "user-a")).toBe(false);
      expect(await verifyPin("1111", "user-a")).toBe(true);
    }, 30_000);
  });

  describe("Decision #4 — 10-failed-attempts brute-force wipe", () => {
    it("MAX_FAILED_UNLOCK_ATTEMPTS is pinned at 10", () => {
      expect(MAX_FAILED_UNLOCK_ATTEMPTS).toBe(10);
    });

    // PBKDF2 with 600k iterations under fake-indexeddb costs ~1s per
    // attempt in CI; 10 attempts → ~10s. Per-test timeout is bumped so
    // the brute-force loop has room to breathe without leaking past
    // the suite-wide default.
    it("increments the failed counter on each wrong PIN", async () => {
      await savePinHash("9999");
      for (let i = 1; i < MAX_FAILED_UNLOCK_ATTEMPTS; i++) {
        const r = await verifyPinAttempt("0000");
        expect(r.ok).toBe(false);
        expect(r.wiped).toBe(false);
        expect(r.failed).toBe(i);
      }
      expect(await hasPinSet()).toBe(true);
    }, 30_000);

    it("wipes the credential on the 10th consecutive failure", async () => {
      await savePinHash("9999");
      let last;
      for (let i = 0; i < MAX_FAILED_UNLOCK_ATTEMPTS; i++) {
        last = await verifyPinAttempt("0000");
      }
      expect(last?.ok).toBe(false);
      expect(last?.wiped).toBe(true);
      expect(last?.failed).toBe(MAX_FAILED_UNLOCK_ATTEMPTS);
      expect(await hasPinSet()).toBe(false);
    }, 30_000);

    it("resets the counter on a successful unlock", async () => {
      await savePinHash("9999");
      for (let i = 0; i < 5; i++) {
        await verifyPinAttempt("0000");
      }
      const success = await verifyPinAttempt("9999");
      expect(success.ok).toBe(true);
      expect(success.failed).toBe(0);
      const after = await verifyPinAttempt("0000");
      expect(after.failed).toBe(1);
      expect(after.wiped).toBe(false);
    }, 30_000);
  });

  describe("S6 — PBKDF2 ramp-up (OWASP 2023, 600k iterations) and v=1→v=2 migration", () => {
    it("CURRENT_PBKDF2_ITERATIONS pins iteration count at 600_000 (OWASP 2023 floor)", () => {
      // Snapshot test — if you bump iterations again, also bump
      // LATEST_CRED_VERSION + add a migration branch in verifyPin.
      expect(CURRENT_PBKDF2_ITERATIONS).toBe(600_000);
      expect(LATEST_CRED_VERSION).toBe(2);
    });

    it("savePinHash writes credentials at the current version (v=2)", async () => {
      await savePinHash("1234");
      const cred = await __readRawCredForTests();
      expect(cred).not.toBeNull();
      expect(cred?.v).toBe(2);
    });

    it("PBKDF2 deriveBits is invoked with iterations=600_000 on save", async () => {
      const deriveBitsSpy = vi.spyOn(crypto.subtle, "deriveBits");
      await savePinHash("1234");
      expect(deriveBitsSpy).toHaveBeenCalled();
      const params = deriveBitsSpy.mock.calls[0]?.[0] as
        { iterations?: number } | undefined;
      expect(params?.iterations).toBe(600_000);
    });

    it("verifies a legacy v=1 credential (derived with 200k iterations)", async () => {
      // Seed the IDB with a pre-S6-shaped record (no `v` field).
      await __seedLegacyCredForTests("4242");
      const before = await __readRawCredForTests();
      expect(before?.v).toBeUndefined();

      expect(await verifyPin("4242")).toBe(true);
    });

    it("upgrades a legacy v=1 credential to v=2 (600k) on successful unlock", async () => {
      await __seedLegacyCredForTests("4242");
      const before = await __readRawCredForTests();
      expect(before?.v).toBeUndefined();
      const oldHash = before?.hash;

      expect(await verifyPin("4242")).toBe(true);

      const after = await __readRawCredForTests();
      expect(after?.v).toBe(2);
      // Re-derive must rotate salt + hash so a leaked v=1 dump no
      // longer matches the stored 600k-iteration hash.
      expect(after?.hash).toBeDefined();
      expect(oldHash).toBeDefined();
      if (!after?.hash || !oldHash) throw new Error("hashes missing");
      expect(Array.from(after.hash)).not.toEqual(Array.from(oldHash));

      // Subsequent unlock with the same PIN must still succeed against
      // the upgraded record.
      expect(await verifyPin("4242")).toBe(true);
    });

    it("does not migrate when the supplied PIN is wrong on a legacy v=1 record", async () => {
      await __seedLegacyCredForTests("4242");
      const before = await __readRawCredForTests();

      expect(await verifyPin("0000")).toBe(false);

      const after = await __readRawCredForTests();
      // Untouched — still legacy.
      expect(after?.v).toBeUndefined();
      expect(after?.hash).toBeDefined();
      expect(before?.hash).toBeDefined();
      if (!after?.hash || !before?.hash) throw new Error("hashes missing");
      expect(Array.from(after.hash)).toEqual(Array.from(before.hash));
    });
  });
});
