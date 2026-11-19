// Криптоядро aiAtRest: ключ в IndexedDB + AES-GCM. Винесено в окремий чанк і
// підвантажується динамічно (eager-бюджет, AGENTS.md § Performance budgets).

import { logger } from "@shared/lib";

export interface Envelope {
  v: number;
  iv: string;
  ct: string;
}

const DB_NAME = "sergeant_ai_at_rest";
const STORE = "keys";
const KEY_ID = "v1";
const ENVELOPE_VERSION = 1;

// ── ключ ────────────────────────────────────────────────────────────────────

type KeyState = "idle" | "ready" | "unavailable";
let keyState: KeyState = "idle";
let cryptoKey: CryptoKey | null = null;
let keyPromise: Promise<CryptoKey | null> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadOrCreateKey(): Promise<CryptoKey> {
  // Генеруємо ДО транзакції: IDB-транзакція автокомітиться через await. Якщо
  // інша вкладка встигла першою, беремо її ключ, а свій викидаємо.
  const fresh = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const db = await openDb();
  try {
    // Резолвимо лише на `oncomplete`: ключ, що лишився тільки в памʼяті
    // (транзакцію перервано), дав би шифртекст, нечитний після релоаду.
    return await new Promise<CryptoKey>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      let chosen: CryptoKey | null = null;
      const get = store.get(KEY_ID);
      get.onsuccess = () => {
        const existing = get.result as CryptoKey | undefined;
        if (existing) {
          chosen = existing;
        } else {
          chosen = fresh;
          store.put(fresh, KEY_ID);
        }
      };
      tx.oncomplete = () => {
        if (chosen) resolve(chosen);
        else reject(new Error("ключ не збережено"));
      };
      tx.onabort = () => reject(tx.error ?? new Error("транзакцію перервано"));
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function ensureKey(): Promise<CryptoKey | null> {
  if (cryptoKey) return Promise.resolve(cryptoKey);
  if (keyState === "unavailable") return Promise.resolve(null);
  keyPromise ??= (async () => {
    try {
      if (
        typeof crypto === "undefined" ||
        !crypto.subtle ||
        typeof indexedDB === "undefined"
      ) {
        throw new Error("WebCrypto або IndexedDB недоступні");
      }
      cryptoKey = await loadOrCreateKey();
      keyState = "ready";
      return cryptoKey;
    } catch (err) {
      keyState = "unavailable";
      logger.warn(
        "[aiAtRest] шифрування недоступне, історія лишається відкритим текстом",
        err,
      );
      return null;
    }
  })();
  return keyPromise;
}

export function resetKey(): void {
  keyState = "idle";
  cryptoKey = null;
  keyPromise = null;
}

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const aad = (slot: string) => new TextEncoder().encode(slot);

/** Шифрує відкритий текст у конверт; свіжий випадковий IV на кожен виклик. */
export async function seal(
  slot: string,
  plain: string,
): Promise<string | null> {
  const key = await ensureKey();
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(slot) },
    key,
    new TextEncoder().encode(plain),
  );
  const env: Envelope = {
    v: ENVELOPE_VERSION,
    iv: toB64(iv),
    ct: toB64(new Uint8Array(ct)),
  };
  return JSON.stringify(env);
}

export async function open(slot: string, env: Envelope): Promise<string> {
  if (env.v !== ENVELOPE_VERSION) {
    throw new Error(`непідтримувана версія конверта: ${env.v}`);
  }
  const key = await ensureKey();
  if (!key) throw new Error("ключ недоступний");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(env.iv), additionalData: aad(slot) },
    key,
    fromB64(env.ct),
  );
  return new TextDecoder().decode(pt);
}
