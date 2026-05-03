/**
 * MMKV-backed storage adapter for the mobile app.
 *
 * Mirrors the API shape of `apps/web/src/shared/lib/storage/storage.ts` and
 * `apps/web/src/shared/lib/storage/createModuleStorage.ts` so that hooks and modules
 * ported from the web can consume the same named exports on native. The
 * web counterpart is backed by `localStorage`; this one is backed by a
 * single `react-native-mmkv` instance (`id: "sergeant.mobile.v1"`).
 *
 * Intentional scope:
 *
 * - **Non-sensitive state only.** Auth tokens and other secrets MUST NOT
 *   be written through this module. They live in `expo-secure-store`
 *   (already wired via `@better-auth/expo`). MMKV on iOS/Android stores
 *   data in app-private sandbox, but we do not treat it as a secure
 *   enclave; always prefer Keychain/Keystore for credentials.
 * - **At-rest encryption (post-bootstrap).** The module is loaded with a
 *   plaintext MMKV instance (`id: "sergeant.mobile.v1"`) so that helpers
 *   keep working synchronously during the JS bundle's eval phase, but
 *   `bootstrapEncryptedStorage()` (see `./storageEncryption`) swaps the
 *   active instance to an encrypted one (`id: "sergeant.mobile.v1.enc"`)
 *   on app startup. The encryption key is a 32-byte random secret
 *   stored in `expo-secure-store` (Keychain on iOS, Keystore on Android),
 *   so it never lives in the JS bundle. The bootstrap also migrates any
 *   data left in the legacy plaintext store on first run after the
 *   upgrade. The React tree must not mount until bootstrap completes;
 *   `app/_layout.tsx` gates rendering behind a `ready` flag for that.
 *   Auth tokens still live in `expo-secure-store` directly — MMKV is
 *   for non-credential JSON blobs only.
 * - **No key prefixing.** Keys are passed through verbatim, matching the
 *   web adapter's behaviour so existing storage-key constants (e.g.
 *   `apps/web/src/shared/lib/storageKeys.ts`) port unchanged.
 *
 * This module deliberately does not wire itself into `useCloudSync` or
 * any existing hooks — that is Phase 3 of the RN migration plan.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { MMKV } from "react-native-mmkv";

import { createMmkvKVStore } from "@sergeant/shared";
import type { KVStore } from "@sergeant/shared";

/**
 * Shared MMKV instance for the whole mobile app. The `id` is versioned
 * so we can cut a clean break in the future without colliding with old
 * data on upgraded installs.
 *
 * This module-scoped binding is intentionally `let`: at boot we open a
 * plaintext instance synchronously so helpers work during the bundle's
 * eval phase, then `bootstrapEncryptedStorage()` swaps it for an
 * encrypted instance once the SecureStore-derived key is available.
 * After the swap, every helper in this file reads/writes through the
 * encrypted instance because each call dereferences `activeMmkv` at
 * call time.
 */
let activeMmkv: MMKV = new MMKV({ id: "sergeant.mobile.v1" });

/**
 * Exposed for tests and rare debug scenarios. Do not reach for this in
 * product code — use the named helpers or `createModuleStorage` instead.
 * After `bootstrapEncryptedStorage()` runs this returns the encrypted
 * instance.
 */
export function _getMMKVInstance(): MMKV {
  return activeMmkv;
}

/**
 * Swap the active MMKV instance. Internal — only `storageEncryption`
 * should call this, after a successful encryption-key bootstrap and
 * data migration. After the swap, every subsequent call to a helper in
 * this module (or anything that reads through `_getMMKVInstance`) reads
 * from the new instance. Live `addOnValueChangedListener` subscriptions
 * registered against the previous instance keep firing on writes to it,
 * so callers must register listeners *after* bootstrap (which the
 * provider gating in `app/_layout.tsx` enforces).
 */
export function _setMMKVInstance(next: MMKV): void {
  activeMmkv = next;
}

/**
 * KVStore adapter for `@sergeant/shared` functions. Wraps the active
 * MMKV instance via a thunk so the encrypted-bootstrap swap (see
 * `_setMMKVInstance`) is transparent to callers. Cross-write
 * notification is wired to MMKV's `addOnValueChangedListener`.
 *
 * Use this when porting a shared helper from `@sergeant/shared/lib/*`
 * that takes a `KVStore`. For module-scoped storage with debounced
 * writes, prefer `createModuleStorage()` below.
 */
export const mobileKVStore: KVStore = createMmkvKVStore(() => activeMmkv);

function readString(key: string): string | null {
  try {
    const v = activeMmkv.getString(key);
    return v === undefined ? null : v;
  } catch {
    return null;
  }
}

function writeString(key: string, value: string): boolean {
  try {
    activeMmkv.set(key, value);
    return true;
  } catch {
    return false;
  }
}

function deleteKey(key: string): boolean {
  try {
    activeMmkv.delete(key);
    return true;
  } catch {
    return false;
  }
}

// --- Flat helpers (mirror apps/web/src/shared/lib/storage/storage.ts) ---------

/**
 * Read a JSON value from persistent storage.
 * Returns `fallback` on missing/invalid/unavailable storage.
 */
export function safeReadLS<T = unknown>(
  key: string,
  fallback: T | null = null,
): T | null {
  const raw = readString(key);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Read the raw string value from persistent storage without JSON parsing.
 */
export function safeReadStringLS(
  key: string,
  fallback: string | null = null,
): string | null {
  const raw = readString(key);
  return raw === null ? fallback : raw;
}

/**
 * Write a value to persistent storage. Strings are stored as-is;
 * everything else is JSON-serialized. Returns true on success.
 */
export function safeWriteLS(key: string, value: unknown): boolean {
  try {
    const serialized =
      typeof value === "string" ? value : JSON.stringify(value);
    return writeString(key, serialized);
  } catch {
    return false;
  }
}

/**
 * Remove a key from persistent storage. Returns true on success.
 */
export function safeRemoveLS(key: string): boolean {
  return deleteKey(key);
}

// --- useLocalStorage (mirror hook API) --------------------------------
//
// The web hook also listens to the cross-tab `storage` event. RN has no
// direct analog (single process), but MMKV exposes
// `addOnValueChangedListener` so the hook can still react to writes from
// other consumers of the same key within the app.
//
// Cloud-sync caveat
// -----------------
// Unlike web (which patches `localStorage.setItem` to auto-mark modules
// dirty — see `apps/web/src/core/cloudSync/storagePatch.ts`), MMKV
// writes go straight to native and bypass any JS interception. This
// means raw `useLocalStorage` does NOT trigger a cloud-sync push on its
// own. If the storage key you are writing is registered in
// `apps/mobile/src/sync/config.ts → SYNC_MODULES`, prefer
// `useSyncedStorage` from `@/sync/useSyncedStorage` — it wraps this
// hook and calls `enqueueChange(key)` after every write, eliminating
// the easy-to-forget manual call. Use raw `useLocalStorage` only for
// untracked, UI-only state (e.g. selected tab, experimental flags).

export type UseLocalStorageSetter<T> = (next: T | ((prev: T) => T)) => void;
export type UseLocalStorageRemove = () => void;
export type UseLocalStorageReturn<T> = [
  T,
  UseLocalStorageSetter<T>,
  UseLocalStorageRemove,
];

/**
 * React hook backed by MMKV. Stores JSON-serialized values. Mirrors
 * `useLocalStorage` from the web adapter.
 *
 * - Reads the initial value synchronously (MMKV is sync) so there is no
 *   flash of fallback.
 * - Subscribes to MMKV value changes so writes from *other* consumers of
 *   the same key are picked up — mirroring the web adapter's
 *   cross-tab `storage` semantics. Writes initiated by this hook are
 *   suppressed so we do not re-render with a freshly `JSON.parse`'d
 *   copy and break reference equality for the caller.
 * - Supports the `(prev) => next` updater signature, like `useState`.
 */
export function useLocalStorage<T>(
  key: string,
  fallback: T,
): UseLocalStorageReturn<T> {
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  // Guard against our own writes re-entering the value-changed listener.
  // On web, `StorageEvent` only fires for cross-tab writes, so the
  // equivalent listener is a no-op for same-tab writes; MMKV has no such
  // filter, so we simulate it with this ref.
  const selfWriteRef = useRef(false);

  const [value, setValue] = useState<T>(
    () => (safeReadLS<T>(key, fallback) as T) ?? fallback,
  );

  useEffect(() => {
    setValue(
      (safeReadLS<T>(key, fallbackRef.current) as T) ?? fallbackRef.current,
    );
  }, [key]);

  useEffect(() => {
    const sub = activeMmkv.addOnValueChangedListener((changedKey) => {
      if (changedKey !== key) return;
      if (selfWriteRef.current) return;
      setValue(
        (safeReadLS<T>(key, fallbackRef.current) as T) ?? fallbackRef.current,
      );
    });
    return () => sub.remove();
  }, [key]);

  const update: UseLocalStorageSetter<T> = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved =
          typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
        selfWriteRef.current = true;
        try {
          safeWriteLS(key, resolved);
        } finally {
          selfWriteRef.current = false;
        }
        return resolved;
      });
    },
    [key],
  );

  const remove: UseLocalStorageRemove = useCallback(() => {
    selfWriteRef.current = true;
    try {
      safeRemoveLS(key);
    } finally {
      selfWriteRef.current = false;
    }
    setValue(fallbackRef.current);
  }, [key]);

  return [value, update, remove];
}

// --- createModuleStorage (mirror factory) -----------------------------

export const DEFAULT_DEBOUNCE_MS = 500;

export interface ModuleStorageOptions {
  name?: string;
  defaultDebounceMs?: number;
}

export interface ModuleStorage {
  readJSON<T = unknown>(key: string, fallback?: T | null): T | null;
  writeJSON(key: string, value: unknown): boolean;
  readRaw(key: string, fallback?: string | null): string | null;
  writeRaw(key: string, value: unknown): boolean;
  removeItem(key: string): boolean;
  writeJSONDebounced(key: string, value: unknown, delay?: number): void;
  flushPendingWrites(): void;
}

function safeStringify(
  value: unknown,
  reportError: (scope: string, err: unknown) => void,
): string | undefined {
  try {
    return JSON.stringify(value === undefined ? null : value);
  } catch (error) {
    reportError("JSON.stringify", error);
    return undefined;
  }
}

/**
 * Creates an isolated storage API for a module, mirroring the web
 * factory. Each module gets its own `pending`/`last-written` maps so
 * debouncing in one module does not affect another. Keys are passed
 * through verbatim; the factory does not add prefixes automatically.
 *
 * NOTE: there is no `beforeunload`/`pagehide`/`visibilitychange` flush
 * on native. Callers that need a guaranteed flush before a lifecycle
 * transition (background, unmount) should call `flushPendingWrites()`
 * explicitly — e.g. from `AppState` change handlers or component
 * unmount effects.
 */
export function createModuleStorage({
  name = "storage",
  defaultDebounceMs = DEFAULT_DEBOUNCE_MS,
}: ModuleStorageOptions = {}): ModuleStorage {
  const moduleName = String(name);
  const lastWrittenCache = new Map<string, string>();
  const pendingValues = new Map<string, unknown>();
  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function reportError(scope: string, error: unknown): void {
    try {
      console.warn(`[${moduleName}Storage] ${scope}`, error);
    } catch {
      /* ignore logging errors */
    }
  }

  function readJSON<T = unknown>(
    key: string,
    fallback: T | null = null,
  ): T | null {
    const k = String(key);
    const raw = readString(k);
    if (raw === null) return fallback;
    try {
      const parsed = JSON.parse(raw) as T;
      return parsed === undefined ? fallback : parsed;
    } catch (error) {
      reportError(`JSON.parse("${k}")`, error);
      return fallback;
    }
  }

  function writeJSON(key: string, value: unknown): boolean {
    const k = String(key);
    const serialized = safeStringify(value, reportError);
    if (serialized === undefined) return false;
    try {
      activeMmkv.set(k, serialized);
      lastWrittenCache.set(k, serialized);
      return true;
    } catch (error) {
      reportError(`write("${k}")`, error);
      return false;
    }
  }

  function readRaw(key: string, fallback: string | null = null): string | null {
    const k = String(key);
    const v = readString(k);
    return v === null ? fallback : v;
  }

  function writeRaw(key: string, value: unknown): boolean {
    const k = String(key);
    try {
      activeMmkv.set(k, String(value ?? ""));
      return true;
    } catch (error) {
      reportError(`writeRaw("${k}")`, error);
      return false;
    }
  }

  function removeItem(key: string): boolean {
    const k = String(key);
    // Cancel any pending write, otherwise it would re-create the key
    // right after we delete it.
    const timer = pendingTimers.get(k);
    if (timer) {
      clearTimeout(timer);
      pendingTimers.delete(k);
    }
    pendingValues.delete(k);
    lastWrittenCache.delete(k);
    try {
      activeMmkv.delete(k);
      return true;
    } catch (error) {
      reportError(`remove("${k}")`, error);
      return false;
    }
  }

  function flushKey(k: string): void {
    if (!pendingValues.has(k)) return;
    const value = pendingValues.get(k);
    pendingValues.delete(k);
    const timer = pendingTimers.get(k);
    if (timer) {
      clearTimeout(timer);
      pendingTimers.delete(k);
    }
    writeJSON(k, value);
  }

  function writeJSONDebounced(
    key: string,
    value: unknown,
    delay: number = defaultDebounceMs,
  ): void {
    const k = String(key);
    const nextStr = safeStringify(value, reportError);
    if (nextStr === undefined) return;

    const lastStr = lastWrittenCache.get(k);
    const hasPending = pendingTimers.has(k);
    if (!hasPending && lastStr === nextStr) {
      return; // Value unchanged — skip write.
    }

    pendingValues.set(k, value);

    const existing = pendingTimers.get(k);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(
      () => {
        pendingTimers.delete(k);
        const val = pendingValues.get(k);
        pendingValues.delete(k);
        writeJSON(k, val);
      },
      Math.max(0, Number(delay) || defaultDebounceMs),
    );
    pendingTimers.set(k, timer);
  }

  function flushPendingWrites(): void {
    const keys = Array.from(pendingValues.keys());
    for (const k of keys) flushKey(k);
  }

  return {
    readJSON,
    writeJSON,
    readRaw,
    writeRaw,
    removeItem,
    writeJSONDebounced,
    flushPendingWrites,
  };
}
