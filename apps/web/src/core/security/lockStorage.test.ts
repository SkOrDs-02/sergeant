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
        | { iterations?: number }
        | undefined;
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
