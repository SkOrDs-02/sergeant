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
//   value: { salt: Uint8Array, hash: Uint8Array, v?: 1 | 2, failed?: number,
//            lockedUntil?: number }
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
 * Brute-force protection (audit 10 / Decision #4, переглянуто sec-12/priv-14,
 * рішення власника 2026-10): лічильник послідовних невдалих `verifyPin`
 * живе в самому креденшелі.
 *
 *   - перші `FREE_UNLOCK_ATTEMPTS` (5) спроб без пауз між ними;
 *   - після 5-ї невдачі наростаюча пауза перед наступною спробою: 30 с,
 *     60 с, 120 с, 240 с, 480 с після 5-ї..9-ї (`lockoutDelayMs`);
 *     її кінець (`lockedUntil`) зберігається в IDB, тож перезавантаження
 *     сторінки паузу не скидає;
 *   - на `MAX_FAILED_UNLOCK_ATTEMPTS`-й (10) невдачі PIN перестає
 *     прийматися взагалі (`lockedOut`). Креденшел НЕ стирається і замок НЕ
 *     знімається: раніше 10-та невдача стирала хеш і пускала в застосунок,
 *     тобто атака перебором закінчувалась входом. Вийти з цього стану
 *     можна лише виходом з акаунта (`useAppLock.signOut`), який і стирає
 *     креденшел після успішного виходу, а далі потрібен пароль акаунта.
 *
 * Лічильник песимістичний: резервування спроби (`failed + 1`, `lockedUntil`)
 * пишеться в одній readwrite-транзакції ДО PBKDF2, тож ліміт тримається і при
 * паралельних викликах та кількох вкладках; успіх скидає лічильник.
 *
 * Чому 10 і чому затримка: PBKDF2 на 600k ітерацій + 4-6-значний PIN дає
 * атакуючому, що витяг IDB-блоб, перевагу офлайн; затримка й ліміт
 * захищають лише від ОНЛАЙН-перебору з фізичним доступом до розблокованого
 * пристрою. Налаштування ітерацій PBKDF2 не змінюються.
 */
export const MAX_FAILED_UNLOCK_ATTEMPTS = 10;
export const FREE_UNLOCK_ATTEMPTS = 5;
export const LOCKOUT_BASE_DELAY_MS = 30_000;

/**
 * Пауза (мс) після `failed`-ї поспіль невдалої спроби. 0 для перших
 * `FREE_UNLOCK_ATTEMPTS - 1` невдач (5-та вже вмикає паузу) і для `failed >= MAX_FAILED_UNLOCK_ATTEMPTS`
 * (там не пауза, а повне блокування PIN).
 */
export function lockoutDelayMs(failed: number): number {
  if (failed < FREE_UNLOCK_ATTEMPTS || failed >= MAX_FAILED_UNLOCK_ATTEMPTS) {
    return 0;
  }
  return LOCKOUT_BASE_DELAY_MS * 2 ** (failed - FREE_UNLOCK_ATTEMPTS);
}

// Стеля залишку паузи при читанні `lockedUntil`: годинник, відкручений
// назад (або пошкоджене значення), не має зробити паузу довшою за найбільшу
// легітимну.
const MAX_LOCKOUT_DELAY_MS = lockoutDelayMs(MAX_FAILED_UNLOCK_ATTEMPTS - 1);

function remainingDelayMs(lockedUntil: number | undefined): number {
  if (typeof lockedUntil !== "number" || !Number.isFinite(lockedUntil)) {
    return 0;
  }
  return Math.min(Math.max(lockedUntil - Date.now(), 0), MAX_LOCKOUT_DELAY_MS);
}

interface LockCredV1 {
  salt: Uint8Array;
  hash: Uint8Array;
  v?: 1;
  failed?: number;
  /** Epoch ms, до якого нову спробу відхиляємо без PBKDF2. */
  lockedUntil?: number;
}

interface LockCredV2 {
  salt: Uint8Array;
  hash: Uint8Array;
  v: 2;
  failed?: number;
  lockedUntil?: number;
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

async function writeCred(cred: LockCred, key: string): Promise<void> {
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
 * Протокол перебору (див. `MAX_FAILED_UNLOCK_ATTEMPTS`):
 *
 *   - Лічильник збільшується АТОМАРНО ДО перевірки PIN (`reserveAttempt`):
 *     паралельні спроби (швидкі submit-и, кілька вкладок) не діляться одним
 *     значенням `failed`.
 *   - Success → скидає `failed` і `lockedUntil`.
 *   - Failure → лічильник уже збільшено; з 5-ї невдачі виставлено
 *     `lockedUntil` (наростаюча пауза), на 10-й повертає `lockedOut: true`.
 *     Креденшел лишається в сховищі.
 *   - Спроба під час паузи або після `lockedOut` відхиляється ОДРАЗУ
 *     (`throttled: true`) без PBKDF2 і без зміни лічильника, навіть якщо PIN
 *     правильний.
 *
 * `verifyPin` лишається булевим входом для старих викликів і тестів; код,
 * якому потрібні пауза й `lockedOut`, викликає `verifyPinAttempt`.
 *
 * Усі читання/записи йдуть у партицію `userId` (audit F16), тож лічильник
 * одного користувача не зачіпає іншого. Лічильник ведеться і для legacy
 * v=1 записів (версія й хеш у записі лишаються як були; міграція на v=2
 * відбувається лише при успішному розблокуванні).
 */
export interface VerifyPinResult {
  ok: boolean;
  /** Поточна кількість поспіль невдалих спроб (після цієї). */
  failed: number;
  /** PIN більше не приймається: лишився тільки вихід з акаунта. */
  lockedOut: boolean;
  /** Скільки мс до наступної дозволеної спроби (0 = можна зараз). */
  retryAfterMs: number;
  /** Спробу відхилено без перевірки PIN (пауза або `lockedOut`). */
  throttled: boolean;
}

export interface LockStatus {
  hasPin: boolean;
  lockedOut: boolean;
  retryAfterMs: number;
}

/** Одне читання креденшела: чи є PIN, чи він заблокований, скільки ще чекати. */
export async function readLockStatus(
  userId?: string | null,
): Promise<LockStatus> {
  const cred = await loadCred(recordKey(userId));
  if (!cred) return { hasPin: false, lockedOut: false, retryAfterMs: 0 };
  const lockedOut = (cred.failed ?? 0) >= MAX_FAILED_UNLOCK_ATTEMPTS;
  return {
    hasPin: true,
    lockedOut,
    retryAfterMs: lockedOut ? 0 : remainingDelayMs(cred.lockedUntil),
  };
}

function withAttemptState(
  cred: LockCred,
  failed: number,
  lockedUntil: number | undefined,
): LockCred {
  const next: LockCred = { ...cred, failed };
  if (lockedUntil === undefined) delete next.lockedUntil;
  else next.lockedUntil = lockedUntil;
  return next;
}

/** Результат атомарного резервування спроби (див. `reserveAttempt`). */
type Reservation =
  | { kind: "none" }
  | { kind: "lockedOut"; failed: number }
  | { kind: "wait"; failed: number; waitMs: number }
  | {
      kind: "reserved";
      cred: LockCred;
      nextFailed: number;
      delayMs: number;
    };

/**
 * Песимістичний лічильник: ОДНА readwrite-транзакція IDB робить `get` →
 * перевірку ліміту/паузи → `put` із `failed + 1` і новим `lockedUntil` ДО
 * PBKDF2. Транзакції на одному сховищі IDB виконуються послідовно (і між
 * вкладками), тож паралельні спроби бачать лічильник одна одної: N одночасних
 * здогадок коштують N кроків лічильника, а не один. Раніше read → PBKDF2 →
 * write давали всім паралельним викликам той самий `failed = k`, і ліміт у 10
 * спроб та пауза з 5-ї обходились потоком одночасних submit-ів.
 *
 * Якщо записати резервування не вдалось, транзакція відхиляє проміс і спроба
 * НЕ перевіряється (fail-closed): без надійного лічильника перебір не
 * обмежити.
 */
async function reserveAttempt(key: string): Promise<Reservation> {
  const db = await openDb();
  try {
    return await new Promise<Reservation>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      let outcome: Reservation = { kind: "none" };
      const req = store.get(key);
      req.onsuccess = () => {
        const cred = (req.result ?? null) as LockCred | null;
        if (!cred) return;
        const failedSoFar = cred.failed ?? 0;
        if (failedSoFar >= MAX_FAILED_UNLOCK_ATTEMPTS) {
          outcome = { kind: "lockedOut", failed: failedSoFar };
          return;
        }
        const waitMs = remainingDelayMs(cred.lockedUntil);
        if (waitMs > 0) {
          outcome = { kind: "wait", failed: failedSoFar, waitMs };
          return;
        }
        const nextFailed = failedSoFar + 1;
        const delayMs = lockoutDelayMs(nextFailed);
        store.put(
          withAttemptState(
            cred,
            nextFailed,
            delayMs > 0 ? Date.now() + delayMs : undefined,
          ),
          key,
        );
        outcome = { kind: "reserved", cred, nextFailed, delayMs };
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve(outcome);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Після успішної перевірки знімає `failed`/`lockedUntil`, але лише якщо в
 * сховищі досі той самий хеш (PIN не змінили між резервуванням і успіхом).
 * Транзакційно, щоб не затерти чужий запис. Best-effort: збій лишає
 * лічильник вищим, а це безпечний бік.
 */
async function resetAttemptState(
  key: string,
  verified: LockCred,
): Promise<boolean> {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const req = store.get(key);
        req.onsuccess = () => {
          const cur = (req.result ?? null) as LockCred | null;
          if (!cur || !timingSafeEqual(cur.hash, verified.hash)) return;
          const { failed: _failed, lockedUntil: _lockedUntil, ...rest } = cur;
          void _failed;
          void _lockedUntil;
          store.put(rest as LockCred, key);
        };
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
    return true;
  } catch {
    return false;
  }
}

export async function verifyPinAttempt(
  pin: string,
  userId?: string | null,
): Promise<VerifyPinResult> {
  const key = recordKey(userId);
  const reservation = await reserveAttempt(key);
  if (reservation.kind === "none") {
    return {
      ok: false,
      failed: 0,
      lockedOut: false,
      retryAfterMs: 0,
      throttled: false,
    };
  }
  if (reservation.kind === "lockedOut") {
    return {
      ok: false,
      failed: reservation.failed,
      lockedOut: true,
      retryAfterMs: 0,
      throttled: true,
    };
  }
  if (reservation.kind === "wait") {
    return {
      ok: false,
      failed: reservation.failed,
      lockedOut: false,
      retryAfterMs: reservation.waitMs,
      throttled: true,
    };
  }
  // Спробу вже враховано в IDB (`failed + 1`): далі лише перевірка PIN.
  const { cred, nextFailed, delayMs } = reservation;
  const version = credVersion(cred);
  const candidate = await deriveHash(
    pin,
    cred.salt,
    ITERATIONS_BY_VERSION[version],
  );
  if (timingSafeEqual(candidate, cred.hash)) {
    const migrated =
      version < LATEST_CRED_VERSION &&
      (await migrateCredIfNeeded(pin, key, cred));
    if (!migrated) await resetAttemptState(key, cred);
    return {
      ok: true,
      failed: 0,
      lockedOut: false,
      retryAfterMs: 0,
      throttled: false,
    };
  }
  return {
    ok: false,
    failed: nextFailed,
    lockedOut: nextFailed >= MAX_FAILED_UNLOCK_ATTEMPTS,
    retryAfterMs: delayMs,
    throttled: false,
  };
}

export async function verifyPin(
  pin: string,
  userId?: string | null,
): Promise<boolean> {
  return (await verifyPinAttempt(pin, userId)).ok;
}

// Re-derive an already-verified PIN at the current iteration count and
// persist the upgraded credential (fresh record: counter and delay are gone).
// Best-effort: if the write fails we swallow so a transient IDB error never
// blocks unlock — the next successful verify will retry the migration.
// Повертає `false`, коли міграції не відбулось: тоді виклик скидає лічильник.
// Записуємо лише якщо в сховищі досі той самий хеш (PIN не змінили).
async function migrateCredIfNeeded(
  pin: string,
  key: string,
  verified: LockCred,
): Promise<boolean> {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await deriveHash(pin, salt, CURRENT_PBKDF2_ITERATIONS);
    const current = await loadCred(key);
    if (!current || !timingSafeEqual(current.hash, verified.hash)) return false;
    await writeCred({ salt, hash, v: LATEST_CRED_VERSION }, key);
    return true;
  } catch {
    return false;
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

// Test-only: виставити лічильник невдач / паузу без 10 реальних PBKDF2-спроб.
export async function __seedAttemptStateForTests(
  failed: number,
  lockedUntil?: number,
  userId?: string | null,
): Promise<void> {
  const key = recordKey(userId);
  const cred = await loadCred(key);
  if (!cred) throw new Error("seed a PIN before seeding attempt state");
  await writeCred(withAttemptState(cred, failed, lockedUntil), key);
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
