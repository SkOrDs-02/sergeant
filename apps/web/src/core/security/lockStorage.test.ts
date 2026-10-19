import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

import {
  __readRawCredForTests,
  __seedAttemptStateForTests,
  __seedLegacyCredForTests,
  FREE_UNLOCK_ATTEMPTS,
  LOCKOUT_BASE_DELAY_MS,
  lockoutDelayMs,
  readLockStatus,
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

  describe("sec-12/priv-14 — brute-force: наростаюча пауза і lockedOut без стирання", () => {
    // Керований годинник: пауза між спробами залежить від Date.now().
    let nowMs: number;
    beforeEach(() => {
      nowMs = 1_800_000_000_000;
      vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    });

    it("limits are pinned: 10 attempts, 5 free, 30 s base delay", () => {
      expect(MAX_FAILED_UNLOCK_ATTEMPTS).toBe(10);
      expect(FREE_UNLOCK_ATTEMPTS).toBe(5);
      expect(LOCKOUT_BASE_DELAY_MS).toBe(30_000);
    });

    it("lockoutDelayMs: 0 for 1..4, then 30 s doubling for 5..9, 0 at the cap", () => {
      expect([1, 2, 3, 4].map(lockoutDelayMs)).toEqual([0, 0, 0, 0]);
      expect([5, 6, 7, 8, 9].map(lockoutDelayMs)).toEqual([
        30_000, 60_000, 120_000, 240_000, 480_000,
      ]);
      expect(lockoutDelayMs(MAX_FAILED_UNLOCK_ATTEMPTS)).toBe(0);
    });

    // PBKDF2 with 600k iterations under fake-indexeddb costs ~1s per
    // attempt in CI; the loop below runs the real 10-attempt scenario.
    it("10 wrong PINs end in lockedOut: credential is KEPT, never wiped", async () => {
      await savePinHash("9999");
      const results = [];
      for (let i = 1; i <= MAX_FAILED_UNLOCK_ATTEMPTS; i++) {
        const r = await verifyPinAttempt("0000");
        results.push(r);
        expect(r.ok).toBe(false);
        expect(r.throttled).toBe(false);
        expect(r.failed).toBe(i);
        expect(r.retryAfterMs).toBe(lockoutDelayMs(i));
        // Пережити паузу, щоб наступна спроба справді дійшла до PBKDF2.
        nowMs += r.retryAfterMs;
      }
      expect(results.slice(0, 9).every((r) => !r.lockedOut)).toBe(true);
      expect(results[9]?.lockedOut).toBe(true);
      // Раніше тут було `hasPinSet() === false` (креденшел стирався).
      expect(await hasPinSet()).toBe(true);
      expect(await readLockStatus()).toEqual({
        hasPin: true,
        lockedOut: true,
        retryAfterMs: 0,
      });
    }, 60_000);

    it("after lockedOut even the CORRECT PIN is refused, without running PBKDF2", async () => {
      await savePinHash("9999");
      await __seedAttemptStateForTests(MAX_FAILED_UNLOCK_ATTEMPTS);
      const deriveBitsSpy = vi.spyOn(crypto.subtle, "deriveBits");

      const r = await verifyPinAttempt("9999");

      expect(r).toEqual({
        ok: false,
        failed: MAX_FAILED_UNLOCK_ATTEMPTS,
        lockedOut: true,
        retryAfterMs: 0,
        throttled: true,
      });
      expect(deriveBitsSpy).not.toHaveBeenCalled();
      expect(await verifyPin("9999")).toBe(false);
    }, 30_000);

    it("an attempt during the delay is refused without PBKDF2 and keeps the counter", async () => {
      await savePinHash("9999");
      await __seedAttemptStateForTests(5, nowMs + 30_000);
      const deriveBitsSpy = vi.spyOn(crypto.subtle, "deriveBits");

      nowMs += 10_000;
      const r = await verifyPinAttempt("9999"); // правильний PIN, але рано

      expect(r.ok).toBe(false);
      expect(r.throttled).toBe(true);
      expect(r.lockedOut).toBe(false);
      expect(r.retryAfterMs).toBe(20_000);
      expect(r.failed).toBe(5);
      expect(deriveBitsSpy).not.toHaveBeenCalled();
      const raw = await __readRawCredForTests();
      expect(raw?.failed).toBe(5);
    }, 30_000);

    it("after the delay the correct PIN unlocks and clears counter and delay", async () => {
      await savePinHash("9999");
      await __seedAttemptStateForTests(6, nowMs + 60_000);

      nowMs += 60_001;
      const r = await verifyPinAttempt("9999");

      expect(r.ok).toBe(true);
      const raw = await __readRawCredForTests();
      expect(raw?.failed ?? 0).toBe(0);
      expect(raw?.lockedUntil).toBeUndefined();
    }, 30_000);

    it("the delay survives a restart: readLockStatus reports the remaining time", async () => {
      await savePinHash("9999");
      await __seedAttemptStateForTests(5, nowMs + 30_000);
      nowMs += 12_000;
      expect(await readLockStatus()).toEqual({
        hasPin: true,
        lockedOut: false,
        retryAfterMs: 18_000,
      });
    }, 30_000);

    it("a wrong PIN right at the 5th failure persists a 30 s delay", async () => {
      await savePinHash("9999");
      await __seedAttemptStateForTests(4);
      const r = await verifyPinAttempt("0000");
      expect(r.failed).toBe(5);
      expect(r.retryAfterMs).toBe(30_000);
      expect((await __readRawCredForTests())?.lockedUntil).toBe(nowMs + 30_000);
    }, 30_000);

    it("a rewound clock cannot stretch the delay beyond the longest legitimate one", async () => {
      await savePinHash("9999");
      await __seedAttemptStateForTests(5, nowMs + 10 * 24 * 3600 * 1000);
      expect((await readLockStatus()).retryAfterMs).toBe(480_000);
    }, 30_000);

    it("resets the counter on a successful unlock", async () => {
      await savePinHash("9999");
      await __seedAttemptStateForTests(3);
      const success = await verifyPinAttempt("9999");
      expect(success.ok).toBe(true);
      expect(success.failed).toBe(0);
      const after = await verifyPinAttempt("0000");
      expect(after.failed).toBe(1);
      expect(after.lockedOut).toBe(false);
    }, 30_000);

    it("legacy v=1 credentials also count failures (version and hash stay as they were)", async () => {
      await __seedLegacyCredForTests("4242");
      const before = await __readRawCredForTests();
      const r = await verifyPinAttempt("0000");
      expect(r.failed).toBe(1);
      const after = await __readRawCredForTests();
      expect(after?.failed).toBe(1);
      expect(after?.v).toBeUndefined();
      expect(Array.from(after?.hash ?? [])).toEqual(
        Array.from(before?.hash ?? []),
      );
    }, 30_000);

    it("the lockout is per user: another user's slot is unaffected", async () => {
      await savePinHash("1111", "user-a");
      await savePinHash("2222", "user-b");
      await __seedAttemptStateForTests(
        MAX_FAILED_UNLOCK_ATTEMPTS,
        undefined,
        "user-a",
      );
      expect((await readLockStatus("user-a")).lockedOut).toBe(true);
      expect((await readLockStatus("user-b")).lockedOut).toBe(false);
      expect(await verifyPin("2222", "user-b")).toBe(true);
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
