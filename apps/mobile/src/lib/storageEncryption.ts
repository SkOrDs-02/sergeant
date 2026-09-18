/**
 * MMKV at-rest encryption bootstrap.
 *
 * Why this module exists
 * ──────────────────────
 * `react-native-mmkv` supports AES-CFB-128 encryption out of the box, but
 * only if you pass an `encryptionKey` to the constructor. We must NOT
 * ship that key in the JS bundle (it would be trivially extractable from
 * an APK/IPA dump), so the key is generated once on first launch, stored
 * in `expo-secure-store` (Keychain on iOS / Keystore on Android), and
 * read back on every subsequent launch.
 *
 * Lifecycle
 * ─────────
 * 1. Module load (`storage.ts`) opens a *plaintext* MMKV instance with
 *    id `sergeant.mobile.v1` so that helpers work synchronously during
 *    bundle eval. Anyone reading from MMKV before bootstrap finishes
 *    would see plaintext data — but the React tree is gated behind
 *    `bootstrapEncryptedStorage()` in `app/_layout.tsx`, so no product
 *    code runs against the plaintext instance after the first install
 *    that has been upgraded to this version.
 * 2. `bootstrapEncryptedStorage()` runs once at app start:
 *    a. Read or generate a 32-byte random key, store it in SecureStore
 *       (base64-encoded). The key is generated with `expo-crypto`
 *       (which uses platform CSPRNGs) and is therefore unguessable.
 *    b. Open an *encrypted* MMKV instance with id
 *       `sergeant.mobile.v1.enc`.
 *    c. If the migration flag is unset and the legacy plaintext
 *       instance has any data, copy every key into the encrypted store
 *       and clear the legacy store.
 *    d. Set the migration flag in SecureStore so subsequent launches
 *       skip steps b/c.
 *    e. Swap the active MMKV instance via `_setMMKVInstance`.
 * 3. After step 2, every helper in `storage.ts` reads/writes through
 *    the encrypted instance.
 *
 * Idempotency & failure handling
 * ──────────────────────────────
 * The bootstrap is safe to retry: if a migration is interrupted (e.g.
 * the app is killed mid-copy), the next run sees the migration flag
 * still unset and re-copies every legacy key. Encrypted-side keys are
 * overwritten by the copy, so partial state is reconciled. We only set
 * the migration flag *after* the legacy store has been cleared.
 *
 * If SecureStore is unavailable (rare — typically only on broken
 * emulators, jailbroken devices that disable Keychain, or during E2E
 * tests on Detox without keychain enabled) we fall back to the
 * plaintext instance and report the failure to Sentry. This keeps the
 * app usable but flagged. We never silently downgrade to a plaintext
 * key shipped in JS — that would be worse than no encryption.
 *
 * What this module deliberately does NOT do
 * ─────────────────────────────────────────
 * - It does not encrypt auth session tokens. Those already live in
 *   `expo-secure-store` directly (see `authClient.ts`) and never enter
 *   MMKV.
 * - It does not version-bump the MMKV `id` for unrelated reasons. The
 *   `.enc` suffix is the only schema change. If we need to evict all
 *   client data in the future we should bump to `.v2` (and bump the
 *   migration-flag key too).
 * - It does not implement key rotation. If the SecureStore key is ever
 *   compromised we would need to add a rotation path here (regenerate,
 *   re-encrypt blobs into a fresh `id`). Out of scope for now.
 */

import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { MMKV } from "react-native-mmkv";

import { _setMMKVInstance } from "./storage";

/**
 * SecureStore key holding the base64-encoded MMKV encryption key. We
 * version it so we can rotate without colliding with a stale value.
 */
export const ENCRYPTION_KEY_SECURE_STORE_KEY = "sergeant.mmkv.encryptionKey.v1";

/**
 * SecureStore key holding the migration done marker. Written *after*
 * legacy data has been copied + cleared. Reading this is the cheapest
 * way to short-circuit on subsequent launches.
 */
export const MIGRATION_DONE_SECURE_STORE_KEY =
  "sergeant.mmkv.encryptionMigrationDone.v1";

/** MMKV id used for the legacy plaintext instance (pre-encryption builds). */
export const LEGACY_MMKV_ID = "sergeant.mobile.v1";

/** MMKV id used for the encrypted instance. */
export const ENCRYPTED_MMKV_ID = "sergeant.mobile.v1.enc";

/** Number of random bytes used to derive the MMKV encryption key. */
export const ENCRYPTION_KEY_BYTES = 32;

/**
 * Outcome of `bootstrapEncryptedStorage()`. Surfaced to the caller so
 * the splash gate can log/telemetry and so tests can assert on the
 * branch that ran.
 */
export type BootstrapResult =
  | {
      status: "ready";
      /** Whether legacy plaintext data was copied during this run. */
      migrated: boolean;
      /** True if the migration flag was already set at the start of this run. */
      alreadyEncrypted: boolean;
      /** How many keys were copied from legacy → encrypted. */
      migratedKeyCount: number;
    }
  | {
      status: "fallback";
      /**
       * Reason we kept running on the plaintext instance. Reported to
       * Sentry by the caller; never user-visible.
       */
      reason: "secure-store-unavailable" | "encryption-init-failed";
      error: unknown;
    };

type BootstrapDeps = {
  /**
   * Construct an MMKV instance. Injected so tests can swap in a stub
   * without dragging in the native module.
   */
  createMMKV: (options: { id: string; encryptionKey?: string }) => MMKV;
  /** Read a value from secure storage. Returns null if missing. */
  readSecure: (key: string) => Promise<string | null>;
  /** Write a value to secure storage. */
  writeSecure: (key: string, value: string) => Promise<void>;
  /** Generate `n` cryptographically random bytes. */
  randomBytes: (n: number) => Uint8Array;
  /** Apply the active instance swap (so `storage.ts` helpers see it). */
  setActiveInstance: (instance: MMKV) => void;
  /** Optional error sink. Defaults to console.warn. */
  onError?: (label: string, error: unknown) => void;
};

const defaultDeps: BootstrapDeps = {
  createMMKV: (options) => new MMKV(options),
  readSecure: (key) => SecureStore.getItemAsync(key),
  writeSecure: (key, value) => SecureStore.setItemAsync(key, value),
  randomBytes: (n) => Crypto.getRandomBytes(n),
  setActiveInstance: _setMMKVInstance,
  onError: (label, error) => {
    if (__DEV__) {
      console.warn(`[storageEncryption] ${label}`, error);
    }
  },
};

/**
 * Encode a Uint8Array as standard base64. We avoid pulling in `buffer`
 * just for this — btoa works on RN Hermes via the `base-64` shim that
 * Expo already ships, but to keep this module self-contained we
 * implement it inline. The output is ASCII and safe for SecureStore.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const triplet = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    output += alphabet[(triplet >> 18) & 0x3f];
    output += alphabet[(triplet >> 12) & 0x3f];
    output += alphabet[(triplet >> 6) & 0x3f];
    output += alphabet[triplet & 0x3f];
  }
  if (i < bytes.length) {
    const remaining = bytes.length - i;
    if (remaining === 1) {
      const byte = bytes[i]!;
      output += alphabet[(byte >> 2) & 0x3f];
      output += alphabet[(byte << 4) & 0x3f];
      output += "==";
    } else {
      const a = bytes[i]!;
      const b = bytes[i + 1]!;
      output += alphabet[(a >> 2) & 0x3f];
      output += alphabet[((a << 4) | (b >> 4)) & 0x3f];
      output += alphabet[(b << 2) & 0x3f];
      output += "=";
    }
  }
  return output;
}

/**
 * Read the existing encryption key from SecureStore, or generate a new
 * one and persist it. Returns the base64-encoded key string suitable
 * for `new MMKV({ encryptionKey })`.
 *
 * Throws if SecureStore is unreachable. Callers must catch and decide
 * the fallback policy.
 */
async function getOrCreateEncryptionKey(deps: BootstrapDeps): Promise<string> {
  const existing = await deps.readSecure(ENCRYPTION_KEY_SECURE_STORE_KEY);
  if (existing && existing.length > 0) {
    return existing;
  }
  const fresh = bytesToBase64(deps.randomBytes(ENCRYPTION_KEY_BYTES));
  await deps.writeSecure(ENCRYPTION_KEY_SECURE_STORE_KEY, fresh);
  return fresh;
}

/**
 * Copy every string value from `source` into `target`, overwriting any
 * existing entries. We only copy strings because every helper in
 * `storage.ts` writes strings (JSON-serialized blobs or raw strings).
 * If a future helper writes typed values (`number`, `boolean`, buffer)
 * this needs to be extended — guarded by the test in
 * `__tests__/storageEncryption.test.ts`.
 */
function copyAllKeys(source: MMKV, target: MMKV): number {
  const keys = source.getAllKeys();
  let copied = 0;
  for (const key of keys) {
    const value = source.getString(key);
    if (value === undefined) continue;
    target.set(key, value);
    copied += 1;
  }
  return copied;
}

/**
 * Run the bootstrap. Idempotent. Returns a `BootstrapResult` describing
 * the outcome; never throws. The caller should log `fallback` results
 * to Sentry.
 *
 * This MUST be awaited before any provider that touches storage mounts
 * (cloud sync, query hydration, modular stores). `app/_layout.tsx`
 * enforces that with a `ready` flag tied to Expo's splash screen.
 */
export async function bootstrapEncryptedStorage(
  overrides: Partial<BootstrapDeps> = {},
): Promise<BootstrapResult> {
  const deps: BootstrapDeps = { ...defaultDeps, ...overrides };

  let encryptionKey: string;
  try {
    encryptionKey = await getOrCreateEncryptionKey(deps);
  } catch (error) {
    deps.onError?.("getOrCreateEncryptionKey", error);
    return {
      status: "fallback",
      reason: "secure-store-unavailable",
      error,
    };
  }

  let encryptedInstance: MMKV;
  try {
    encryptedInstance = deps.createMMKV({
      id: ENCRYPTED_MMKV_ID,
      encryptionKey,
    });
  } catch (error) {
    deps.onError?.("createEncryptedMMKV", error);
    return {
      status: "fallback",
      reason: "encryption-init-failed",
      error,
    };
  }

  let migrationDoneFlag: string | null = null;
  try {
    migrationDoneFlag = await deps.readSecure(MIGRATION_DONE_SECURE_STORE_KEY);
  } catch (error) {
    // Reading the flag is non-fatal — we'll re-attempt the migration,
    // which is itself idempotent (overwrites encrypted-side keys).
    deps.onError?.("readMigrationFlag", error);
  }
  const alreadyEncrypted = migrationDoneFlag === "1";

  let migratedKeyCount = 0;
  let migrated = false;
  if (!alreadyEncrypted) {
    try {
      const legacyInstance = deps.createMMKV({ id: LEGACY_MMKV_ID });
      migratedKeyCount = copyAllKeys(legacyInstance, encryptedInstance);
      if (migratedKeyCount > 0) {
        legacyInstance.clearAll();
        migrated = true;
      }
      try {
        await deps.writeSecure(MIGRATION_DONE_SECURE_STORE_KEY, "1");
      } catch (flagError) {
        // We've already cleared the legacy store; if we can't persist
        // the flag, the next run will re-do the (now-empty) copy and
        // try again. Not fatal.
        deps.onError?.("writeMigrationFlag", flagError);
      }
    } catch (error) {
      deps.onError?.("migrateLegacyStore", error);
      // Encrypted instance still works — swap to it anyway. Worst case
      // the next launch re-attempts the (now mostly empty) migration.
    }
  }

  deps.setActiveInstance(encryptedInstance);

  return {
    status: "ready",
    migrated,
    alreadyEncrypted,
    migratedKeyCount,
  };
}
