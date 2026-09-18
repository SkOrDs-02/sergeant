/**
 * Tests for the MMKV encryption bootstrap.
 *
 * Strategy
 * ────────
 * `bootstrapEncryptedStorage` is dependency-injected — every external
 * surface (MMKV constructor, SecureStore, random bytes, active-instance
 * setter) is overridable via a `BootstrapDeps` partial. We exercise the
 * happy path, idempotency, the legacy-data migration path, the
 * already-migrated short-circuit, and the SecureStore-failure fallback.
 *
 * What we deliberately don't test here
 * ────────────────────────────────────
 * - Real MMKV encryption math: that's the responsibility of
 *   `react-native-mmkv` (and ultimately Tencent's MMKV C++ layer). We
 *   only assert that the constructor was called with the right
 *   `encryptionKey` argument.
 * - Real SecureStore I/O: same reason — Expo owns that contract.
 * - The `app/_layout.tsx` splash gate: covered separately with a render
 *   smoke test (out of scope for this PR; the gate is a 1-line `if`).
 */

// Pull in the shared MMKV jest mock from `jest.setup.js` so this test
// file shares storage-id semantics with the rest of the test suite. We
// do NOT mock `react-native-mmkv` again here.
import { MMKV } from "react-native-mmkv";

import {
  bootstrapEncryptedStorage,
  ENCRYPTED_MMKV_ID,
  ENCRYPTION_KEY_BYTES,
  ENCRYPTION_KEY_SECURE_STORE_KEY,
  LEGACY_MMKV_ID,
  MIGRATION_DONE_SECURE_STORE_KEY,
} from "../storageEncryption";

type MockMMKVCtor = jest.Mock<MMKV, [{ id: string; encryptionKey?: string }]>;

declare global {
  // The mock attaches `__resetForTests` to the MMKV class — pull it
  // off via a typed reference so we don't have to `as any` it here.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNativeMMKVTestingExtensions {
    interface MMKVStatic {
      __resetForTests?: () => void;
    }
  }
}

beforeEach(() => {
  // Reset the shared in-memory store cache between tests so that each
  // test starts with a fresh "device" (no leftover legacy or
  // encrypted-side data).
  (MMKV as unknown as { __resetForTests?: () => void }).__resetForTests?.();
});

/**
 * Build a `Partial<BootstrapDeps>` that mirrors the production
 * dependencies but routes everything through controllable mocks. Tests
 * pass extra overrides on top to simulate failure modes.
 */
function makeDeps(
  overrides: {
    secureStore?: Map<string, string>;
    failReadSecure?: boolean;
    failWriteSecure?: boolean;
    failCreateMMKV?: (id: string) => boolean;
    randomBytes?: (n: number) => Uint8Array;
  } = {},
) {
  const secureStore = overrides.secureStore ?? new Map<string, string>();
  const setActiveInstance = jest.fn<void, [MMKV]>();
  const onError = jest.fn();

  const createMMKV: MockMMKVCtor = jest.fn(
    (options: { id: string; encryptionKey?: string }) => {
      if (overrides.failCreateMMKV?.(options.id)) {
        throw new Error(`mmkv-init-failed: ${options.id}`);
      }
      return new MMKV(options);
    },
  );

  const readSecure = jest.fn(async (key: string): Promise<string | null> => {
    if (overrides.failReadSecure) {
      throw new Error("secure-store-read-failed");
    }
    return secureStore.has(key) ? (secureStore.get(key) as string) : null;
  });

  const writeSecure = jest.fn(async (key: string, value: string) => {
    if (overrides.failWriteSecure) {
      throw new Error("secure-store-write-failed");
    }
    secureStore.set(key, value);
  });

  // Default: deterministic but distinct random bytes per call so we can
  // assert key uniqueness across runs without depending on a real CSPRNG.
  let counter = 0;
  const randomBytes =
    overrides.randomBytes ??
    ((n: number) => {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i += 1) out[i] = (counter * 7 + i) & 0xff;
      counter += 1;
      return out;
    });

  return {
    deps: {
      createMMKV,
      readSecure,
      writeSecure,
      randomBytes,
      setActiveInstance,
      onError,
    },
    secureStore,
    setActiveInstance,
    onError,
    createMMKV,
    readSecure,
    writeSecure,
  };
}

describe("bootstrapEncryptedStorage", () => {
  it("generates a fresh encryption key on first launch and persists it", async () => {
    const harness = makeDeps();

    const result = await bootstrapEncryptedStorage(harness.deps);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.alreadyEncrypted).toBe(false);
    // Fresh install with no legacy data → migrated stays false because
    // there was nothing to migrate.
    expect(result.migrated).toBe(false);
    expect(result.migratedKeyCount).toBe(0);

    // Key was stored in SecureStore at the documented key.
    const stored = harness.secureStore.get(ENCRYPTION_KEY_SECURE_STORE_KEY);
    expect(typeof stored).toBe("string");
    expect((stored as string).length).toBeGreaterThan(0);

    // Migration done flag was written so subsequent runs skip the
    // legacy-copy step.
    expect(harness.secureStore.get(MIGRATION_DONE_SECURE_STORE_KEY)).toBe("1");

    // Encrypted MMKV was instantiated with the SecureStore-stored key.
    const encryptedCall = harness.createMMKV.mock.calls.find(
      (c) => c[0].id === ENCRYPTED_MMKV_ID,
    );
    expect(encryptedCall).toBeDefined();
    expect(encryptedCall?.[0].encryptionKey).toBe(stored);

    // Active instance was swapped exactly once.
    expect(harness.setActiveInstance).toHaveBeenCalledTimes(1);
  });

  it("reuses the existing key on subsequent launches (idempotent)", async () => {
    const sharedSecureStore = new Map<string, string>();
    const firstRun = makeDeps({ secureStore: sharedSecureStore });
    await bootstrapEncryptedStorage(firstRun.deps);

    const keyAfterFirstRun = sharedSecureStore.get(
      ENCRYPTION_KEY_SECURE_STORE_KEY,
    );
    expect(keyAfterFirstRun).toBeDefined();

    const secondRun = makeDeps({ secureStore: sharedSecureStore });
    const result = await bootstrapEncryptedStorage(secondRun.deps);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.alreadyEncrypted).toBe(true);
    expect(result.migrated).toBe(false);
    expect(result.migratedKeyCount).toBe(0);

    // Same key — never regenerated. This matters because regenerating
    // it would orphan all encrypted data on disk.
    expect(sharedSecureStore.get(ENCRYPTION_KEY_SECURE_STORE_KEY)).toBe(
      keyAfterFirstRun,
    );

    // Encrypted MMKV was opened with the same key the first run wrote.
    const encryptedCall = secondRun.createMMKV.mock.calls.find(
      (c) => c[0].id === ENCRYPTED_MMKV_ID,
    );
    expect(encryptedCall?.[0].encryptionKey).toBe(keyAfterFirstRun);

    // Crucially: the second run did NOT touch the legacy plaintext
    // store. Skipping that work avoids re-opening a possibly empty
    // file and wasting startup latency.
    const legacyCall = secondRun.createMMKV.mock.calls.find(
      (c) => c[0].id === LEGACY_MMKV_ID,
    );
    expect(legacyCall).toBeUndefined();
  });

  it("migrates legacy plaintext data into the encrypted store on first run", async () => {
    // Seed the legacy plaintext MMKV with realistic data — the same
    // shape that `safeWriteLS` would have produced on an old build.
    const legacy = new MMKV({ id: LEGACY_MMKV_ID });
    legacy.set("routine.state.v1", JSON.stringify({ habits: ["pushups"] }));
    legacy.set(
      "finyk.manualExpenses.v1",
      JSON.stringify([{ id: "1", amount: 42 }]),
    );
    legacy.set("ftux.completed", "true");

    const harness = makeDeps();
    const result = await bootstrapEncryptedStorage(harness.deps);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.migrated).toBe(true);
    expect(result.alreadyEncrypted).toBe(false);
    expect(result.migratedKeyCount).toBe(3);

    // The encrypted instance now holds the migrated data, byte-for-byte.
    const encrypted = new MMKV({
      id: ENCRYPTED_MMKV_ID,
      encryptionKey: harness.secureStore.get(
        ENCRYPTION_KEY_SECURE_STORE_KEY,
      ) as string,
    });
    expect(encrypted.getString("routine.state.v1")).toBe(
      JSON.stringify({ habits: ["pushups"] }),
    );
    expect(encrypted.getString("finyk.manualExpenses.v1")).toBe(
      JSON.stringify([{ id: "1", amount: 42 }]),
    );
    expect(encrypted.getString("ftux.completed")).toBe("true");

    // The legacy plaintext store was wiped — opening it again must
    // not return any of the migrated data.
    const legacyAfter = new MMKV({ id: LEGACY_MMKV_ID });
    expect(legacyAfter.getAllKeys()).toEqual([]);

    expect(harness.secureStore.get(MIGRATION_DONE_SECURE_STORE_KEY)).toBe("1");
  });

  it("does not migrate again once the migration flag is set", async () => {
    const sharedSecureStore = new Map<string, string>();
    sharedSecureStore.set(MIGRATION_DONE_SECURE_STORE_KEY, "1");
    sharedSecureStore.set(ENCRYPTION_KEY_SECURE_STORE_KEY, "test-base64-key");

    // Even if there's residual legacy data, a re-run must NOT touch it
    // — that would silently re-import stale state from before a user
    // had reset their app.
    const legacy = new MMKV({ id: LEGACY_MMKV_ID });
    legacy.set("stale-key", "should-stay-in-legacy");

    const harness = makeDeps({ secureStore: sharedSecureStore });
    const result = await bootstrapEncryptedStorage(harness.deps);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.alreadyEncrypted).toBe(true);
    expect(result.migrated).toBe(false);
    expect(result.migratedKeyCount).toBe(0);

    // Encrypted store stays empty — no spurious copy.
    const encrypted = new MMKV({
      id: ENCRYPTED_MMKV_ID,
      encryptionKey: "test-base64-key",
    });
    expect(encrypted.getAllKeys()).toEqual([]);

    // Legacy store retains its data (we didn't open or clear it).
    const legacyAfter = new MMKV({ id: LEGACY_MMKV_ID });
    expect(legacyAfter.getString("stale-key")).toBe("should-stay-in-legacy");
  });

  it("uses the requested number of random bytes for the encryption key", async () => {
    const randomBytes = jest.fn((n: number) => new Uint8Array(n).fill(0xab));
    const harness = makeDeps({ randomBytes });

    await bootstrapEncryptedStorage(harness.deps);

    expect(randomBytes).toHaveBeenCalledWith(ENCRYPTION_KEY_BYTES);
  });

  it("falls back gracefully when SecureStore reads fail", async () => {
    const harness = makeDeps({ failReadSecure: true });

    const result = await bootstrapEncryptedStorage(harness.deps);

    expect(result.status).toBe("fallback");
    if (result.status !== "fallback") return;
    expect(result.reason).toBe("secure-store-unavailable");

    // No instance swap on fallback — `storage.ts` keeps using the
    // plaintext instance it opened at module load time.
    expect(harness.setActiveInstance).not.toHaveBeenCalled();

    // No encrypted MMKV was opened (we never got a key).
    const encryptedCall = harness.createMMKV.mock.calls.find(
      (c) => c[0].id === ENCRYPTED_MMKV_ID,
    );
    expect(encryptedCall).toBeUndefined();
  });

  it("falls back gracefully when MMKV refuses the encryption key", async () => {
    // Simulates a hypothetical native-side rejection — e.g. corrupted
    // MMKV file with a different historical key. We must keep the app
    // alive and fall back to the plaintext instance.
    const harness = makeDeps({
      failCreateMMKV: (id) => id === ENCRYPTED_MMKV_ID,
    });

    const result = await bootstrapEncryptedStorage(harness.deps);

    expect(result.status).toBe("fallback");
    if (result.status !== "fallback") return;
    expect(result.reason).toBe("encryption-init-failed");

    expect(harness.setActiveInstance).not.toHaveBeenCalled();
  });

  it("survives a transient migration-flag write failure", async () => {
    // Simulates a SecureStore that lets us READ but blows up on write
    // for the migration-flag specifically. The bootstrap must still
    // complete (active instance swapped, encrypted store populated)
    // because the next run will simply re-attempt the now-empty copy.
    const sharedSecureStore = new Map<string, string>();
    sharedSecureStore.set(ENCRYPTION_KEY_SECURE_STORE_KEY, "preexisting-key");

    // Pre-seed legacy data so there's something to migrate.
    const legacy = new MMKV({ id: LEGACY_MMKV_ID });
    legacy.set("a", "1");

    const setActiveInstance = jest.fn<void, [MMKV]>();
    const onError = jest.fn();

    const result = await bootstrapEncryptedStorage({
      createMMKV: (options) => new MMKV(options),
      readSecure: async (key) =>
        sharedSecureStore.has(key)
          ? (sharedSecureStore.get(key) as string)
          : null,
      writeSecure: async (key, value) => {
        if (key === MIGRATION_DONE_SECURE_STORE_KEY) {
          throw new Error("flag-write-failed");
        }
        sharedSecureStore.set(key, value);
      },
      randomBytes: (n) => new Uint8Array(n),
      setActiveInstance,
      onError,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.migrated).toBe(true);
    expect(result.migratedKeyCount).toBe(1);

    // The active instance is still swapped — the user gets encrypted
    // storage even though the flag write failed.
    expect(setActiveInstance).toHaveBeenCalledTimes(1);

    // The error sink saw the flag-write failure. We don't pin the
    // exact label so the production code is free to reword it.
    expect(onError).toHaveBeenCalled();
    const errorLabels = onError.mock.calls.map((c) => c[0]);
    expect(errorLabels).toContain("writeMigrationFlag");
  });
});
