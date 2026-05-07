// App-lock credential store — SubtleCrypto PBKDF2 hash in IndexedDB.
//
// Why IndexedDB instead of localStorage: IDB survives PWA cache clears, has
// a larger quota, and is not accessible from other-origin service workers.
// The hash (not the PIN) is stored so brute-force requires running PBKDF2
// locally — no plaintext anywhere.
//
// IDB schema: db "sergeant_app_lock" / store "lock_cred" / key "v1"
//   value: { salt: Uint8Array, hash: Uint8Array }

const DB_NAME = "sergeant_app_lock";
const STORE = "lock_cred";
const KEY = "v1";

interface LockCred {
  salt: Uint8Array;
  hash: Uint8Array;
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

async function deriveHash(pin: string, salt: Uint8Array): Promise<Uint8Array> {
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
      salt: salt.buffer as ArrayBuffer,
      iterations: 200_000,
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

export async function savePinHash(pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(pin, salt);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ salt, hash }, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function verifyPin(pin: string): Promise<boolean> {
  const cred = await loadCred();
  if (!cred) return false;
  const candidate = await deriveHash(pin, cred.salt);
  return timingSafeEqual(candidate, cred.hash);
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
