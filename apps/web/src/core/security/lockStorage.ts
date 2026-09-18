// App-lock credential store — SubtleCrypto PBKDF2 hash in IndexedDB.
//
// Why IndexedDB instead of localStorage: IDB survives PWA cache clears, has
// a larger quota, and is not accessible from other-origin service workers.
// The hash (not the PIN) is stored so brute-force requires running PBKDF2
// locally — no plaintext anywhere.
//
// IDB schema: db "sergeant_app_lock" / store "lock_cred"
//   key:   "v1:<userKey>" — the credential record is partitioned per
//          Better-Auth user id so user A's PIN is never read or cleared from
//          user B's slot on a shared device (audit F16). `<userKey>` is the
//          signed-in user id, or "anon" when signed out. The "v1" prefix is
//          the *key-namespace* version (bumpable independently of the value
//          `v` below).
//   value: { salt: Uint8Array, hash: Uint8Array, v?: 1 | 2, failed?: number }
//
// `v` is the credential format version, not the IDB schema version (the
// store layout is unchanged). `v` controls which PBKDF2 iteration count
// was used to derive `hash`:
//   v=undefined | 1 → 200_000 (legacy, pre-S6 OWASP-2023 bump)
//   v=2            → 600_000 (current; OWASP 2023 floor for SHA-256)
// New credentials are written at LATEST_CRED_VERSION. On successful
// `verifyPin`, legacy credentials are silently re-derived and persisted
// at the current version (migrateCredIfNeeded).

const DB_NAME = "sergeant_app_lock";
const STORE = "lock_cred";

// Audit F16: per-user record-key partitioning. The "v1" prefix is the
// key-namespace version; `<userKey>` is the Better-Auth user id (or "anon"
// when signed out). Every public entry point takes an optional trailing
// `userId` so callers in an authenticated context never touch the `anon`
// slot (and vice-versa).
const KEY_PREFIX = "v1";
const ANON_USER_KEY = "anon";

function recordKey(userId?: string | null): string {
  const userKey = userId && userId.length > 0 ? userId : ANON_USER_KEY;
  return `${KEY_PREFIX}:${userKey}`;
}

export const LATEST_CRED_VERSION = 2;
export type CredVersion = 1 | 2;

const ITERATIONS_BY_VERSION: Record<CredVersion, number> = {
  1: 200_000,
  2: 600_000,
};

export const CURRENT_PBKDF2_ITERATIONS =
  // Safe default per OWASP 2023 recommendations
  ITERATIONS_BY_VERSION[LATEST_CRED_VERSION];

/**
 * Audit 10 / Decision #4 ("10 failed attempts wipe"): after this many
 * consecutive failed `verifyPin` calls the credential is wiped, the
 * counter is dropped, and `useAppLock` falls through to the setup flow.
 *
 * Why 10: PBKDF2 with 600k iterations + a 4-6 digit numeric PIN gives an
 * attacker who exfiltrates the IDB blob the upper hand offline. The wipe
 * protects only against an _online_ adversary with physical access to an
 * unlocked-but-pin-required device. 10 is a comfortable margin for a
 * fat-finger user (more than iOS, less than Android pattern-lock).
 */
export const MAX_FAILED_UNLOCK_ATTEMPTS = 10;

interface LockCredV1 {
  salt: Uint8Array;
  hash: Uint8Array;
  v?: 1;
  failed?: number;
}

interface LockCredV2 {
  salt: Uint8Array;
  hash: Uint8Array;
  v: 2;
  failed?: number;
}

type LockCred = LockCredV1 | LockCredV2;

function credVersion(cred: LockCred): CredVersion {
  return cred.v === 2 ? 2 : 1;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deriveHash(
  pin: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function writeCred(cred: LockCredV2, key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(cred, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function savePinHash(
  pin: string,
  userId?: string | null,
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(pin, salt, CURRENT_PBKDF2_ITERATIONS);
  await writeCred({ salt, hash, v: LATEST_CRED_VERSION }, recordKey(userId));
}

/**
 * Audit 10 / Decision #4: brute-force wipe protocol.
 *
 *   - Success → resets the persisted `failed` counter to 0.
 *   - Failure → increments. On the `MAX_FAILED_UNLOCK_ATTEMPTS`-th
 *     consecutive failure the credential is wiped (`deleteCred`) and
 *     the result is `{ ok: false, wiped: true }`. The next mount of
 *     `useAppLock` will see `hasPinSet() === false` and fall through
 *     to "idle"; Settings shows the un-configured state and the user
 *     can re-enroll.
 *
 * `verifyPin` is preserved as the legacy boolean entry point for
 * `useAppLock` and the existing tests. New call sites should prefer
 * `verifyPinAttempt` so the wipe signal is observable.
 *
 * All reads/writes target the `userId` partition (audit F16) — the wipe
 * therefore only ever clears the credential of the user being verified.
 */
export interface VerifyPinResult {
  ok: boolean;
  failed: number;
  wiped: boolean;
}

export async function verifyPinAttempt(
  pin: string,
  userId?: string | null,
): Promise<VerifyPinResult> {
  const key = recordKey(userId);
  const cred = await loadCred(key);
  if (!cred) return { ok: false, failed: 0, wiped: false };
  const version = credVersion(cred);
  const candidate = await deriveHash(
    pin,
    cred.salt,
    ITERATIONS_BY_VERSION[version],
  );
  const ok = timingSafeEqual(candidate, cred.hash);
  if (ok) {
    if (version < LATEST_CRED_VERSION) {
      await migrateCredIfNeeded(pin, key);
    } else if ((cred.failed ?? 0) > 0) {
      try {
        await writeCred(
          {
            salt: cred.salt,
            hash: cred.hash,
            v: LATEST_CRED_VERSION,
            failed: 0,
          },
          key,
        );
      } catch {
        // best-effort reset
      }
    }
    return { ok: true, failed: 0, wiped: false };
  }
  const nextFailed = (cred.failed ?? 0) + 1;
  if (nextFailed >= MAX_FAILED_UNLOCK_ATTEMPTS) {
    try {
      await deleteCred(key);
    } catch {
      // best-effort wipe
    }
    return { ok: false, failed: nextFailed, wiped: true };
  }
  try {
    if (version >= LATEST_CRED_VERSION) {
      await writeCred(
        {
          salt: cred.salt,
          hash: cred.hash,
          v: LATEST_CRED_VERSION,
          failed: nextFailed,
        },
        key,
      );
    }
    // Legacy v=1 records: skip the counter persist so the migration
    // path stays focused on the single-pass re-derive. The counter
    // will start tracking on the first successful unlock + re-write.
  } catch {
    // best-effort counter persist
  }
  return { ok: false, failed: nextFailed, wiped: false };
}

export async function verifyPin(
  pin: string,
  userId?: string | null,
): Promise<boolean> {
  return (await verifyPinAttempt(pin, userId)).ok;
}

// Re-derive an already-verified PIN at the current iteration count and
// persist the upgraded credential. Best-effort: if the write fails we
// swallow so a transient IDB error never blocks unlock — the next
// successful verify will retry the migration.
async function migrateCredIfNeeded(pin: string, key: string): Promise<void> {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await deriveHash(pin, salt, CURRENT_PBKDF2_ITERATIONS);
    await writeCred({ salt, hash, v: LATEST_CRED_VERSION }, key);
  } catch {
    // ignore
  }
}

export async function hasPinSet(userId?: string | null): Promise<boolean> {
  const cred = await loadCred(recordKey(userId));
  return cred !== null;
}

export async function clearPinHash(userId?: string | null): Promise<void> {
  await deleteCred(recordKey(userId));
}

async function deleteCred(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadCred(key: string): Promise<LockCred | null> {
  const db = await openDb();
  const cred = await new Promise<LockCred | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return cred;
}

// Test-only: read the raw stored credential to assert migration outcome.
export async function __readRawCredForTests(
  userId?: string | null,
): Promise<LockCred | null> {
  return loadCred(recordKey(userId));
}

// Test-only: write a legacy v=1 credential (derived with 200k iterations)
// to seed migration tests.
export async function __seedLegacyCredForTests(
  pin: string,
  userId?: string | null,
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(pin, salt, ITERATIONS_BY_VERSION[1]);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    // Intentionally omit `v` so the stored shape matches pre-S6 records.
    tx.objectStore(STORE).put(
      { salt, hash } satisfies LockCredV1,
      recordKey(userId),
    );
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
