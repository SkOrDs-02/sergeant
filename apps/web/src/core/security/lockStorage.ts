// App-lock credential store — SubtleCrypto PBKDF2 hash in IndexedDB.
//
// Why IndexedDB instead of localStorage: IDB survives PWA cache clears, has
// a larger quota, and is not accessible from other-origin service workers.
// The hash (not the PIN) is stored so brute-force requires running PBKDF2
// locally — no plaintext anywhere.
//
// IDB schema: db "sergeant_app_lock" / store "lock_cred" / key "v1"
//   value: { salt: Uint8Array, hash: Uint8Array, v?: 1 | 2 }
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
const KEY = "v1";

export const LATEST_CRED_VERSION = 2;
export type CredVersion = 1 | 2;

const ITERATIONS_BY_VERSION: Record<CredVersion, number> = {
  1: 200_000,
  2: 600_000,
};

export const CURRENT_PBKDF2_ITERATIONS =
  ITERATIONS_BY_VERSION[LATEST_CRED_VERSION];

interface LockCredV1 {
  salt: Uint8Array;
  hash: Uint8Array;
  v?: 1;
}

interface LockCredV2 {
  salt: Uint8Array;
  hash: Uint8Array;
  v: 2;
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

async function writeCred(cred: LockCredV2): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(cred, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function savePinHash(pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(pin, salt, CURRENT_PBKDF2_ITERATIONS);
  await writeCred({ salt, hash, v: LATEST_CRED_VERSION });
}

export async function verifyPin(pin: string): Promise<boolean> {
  const cred = await loadCred();
  if (!cred) return false;
  const version = credVersion(cred);
  const candidate = await deriveHash(
    pin,
    cred.salt,
    ITERATIONS_BY_VERSION[version],
  );
  const ok = timingSafeEqual(candidate, cred.hash);
  if (ok && version < LATEST_CRED_VERSION) {
    await migrateCredIfNeeded(pin);
  }
  return ok;
}

// Re-derive an already-verified PIN at the current iteration count and
// persist the upgraded credential. Best-effort: if the write fails we
// swallow so a transient IDB error never blocks unlock — the next
// successful verify will retry the migration.
async function migrateCredIfNeeded(pin: string): Promise<void> {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await deriveHash(pin, salt, CURRENT_PBKDF2_ITERATIONS);
    await writeCred({ salt, hash, v: LATEST_CRED_VERSION });
  } catch {
    // ignore
  }
}

export async function hasPinSet(): Promise<boolean> {
  const cred = await loadCred();
  return cred !== null;
}

export async function clearPinHash(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadCred(): Promise<LockCred | null> {
  const db = await openDb();
  const cred = await new Promise<LockCred | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return cred;
}

// Test-only: read the raw stored credential to assert migration outcome.
export async function __readRawCredForTests(): Promise<LockCred | null> {
  return loadCred();
}

// Test-only: write a legacy v=1 credential (derived with 200k iterations)
// to seed migration tests.
export async function __seedLegacyCredForTests(pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(pin, salt, ITERATIONS_BY_VERSION[1]);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    // Intentionally omit `v` so the stored shape matches pre-S6 records.
    tx.objectStore(STORE).put({ salt, hash } satisfies LockCredV1, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
