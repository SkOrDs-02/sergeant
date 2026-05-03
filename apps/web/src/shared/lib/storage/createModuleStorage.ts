/**
 * Фабрика централізованого storage-шару для модуля.
 *
 * Кожен модуль (finyk/fizruk/nutrition/routine) отримує ізольований екземпляр
 * зі своїми Map-ами pending/last-written, щоб debounce одного модуля не впливав
 * на інший. Ключі localStorage передаються абсолютні (повні назви) — фабрика
 * не додає префіксів автоматично, щоб не ламати сумісність існуючих даних.
 *
 * Публічний API (як у finykStorage):
 *  - readJSON(key, fallback)
 *  - writeJSON(key, value)
 *  - readRaw(key, fallback)
 *  - writeRaw(key, value)
 *  - removeItem(key)
 *  - writeJSONDebounced(key, value, delay?)
 *  - flushPendingWrites()
 */

import { safeJsonSet } from "./storageQuota";

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

/**
 * Створює ізольований storage-API для модуля.
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

  function hasLocalStorage(): boolean {
    return typeof localStorage !== "undefined" && localStorage !== null;
  }

  function safeStringify(value: unknown): string | undefined {
    try {
      return JSON.stringify(value === undefined ? null : value);
    } catch (error) {
      reportError("JSON.stringify", error);
      return undefined;
    }
  }

  function readJSON<T = unknown>(
    key: string,
    fallback: T | null = null,
  ): T | null {
    if (!hasLocalStorage()) return fallback;
    const k = String(key);
    let raw: string | null;
    try {
      raw = localStorage.getItem(k);
    } catch (error) {
      reportError(`read("${k}")`, error);
      return fallback;
    }
    if (raw === null || raw === undefined) return fallback;
    try {
      const parsed = JSON.parse(raw) as T;
      return parsed === undefined ? fallback : parsed;
    } catch (error) {
      reportError(`JSON.parse("${k}")`, error);
      return fallback;
    }
  }

  function writeJSON(key: string, value: unknown): boolean {
    if (!hasLocalStorage()) return false;
    const k = String(key);
    try {
      const res = safeJsonSet(k, value);
      if (res && res.ok) {
        const serialized = safeStringify(value);
        if (serialized !== undefined) lastWrittenCache.set(k, serialized);
        return true;
      }
      reportError(`write("${k}")`, res?.error || res?.reason || "unknown");
      return false;
    } catch (error) {
      reportError(`write("${k}")`, error);
      return false;
    }
  }

  function readRaw(key: string, fallback: string | null = null): string | null {
    if (!hasLocalStorage()) return fallback;
    const k = String(key);
    try {
      const v = localStorage.getItem(k);
      return v === null || v === undefined ? fallback : v;
    } catch (error) {
      reportError(`readRaw("${k}")`, error);
      return fallback;
    }
  }

  function writeRaw(key: string, value: unknown): boolean {
    if (!hasLocalStorage()) return false;
    const k = String(key);
    try {
      localStorage.setItem(k, String(value ?? ""));
      return true;
    } catch (error) {
      reportError(`writeRaw("${k}")`, error);
      return false;
    }
  }

  function removeItem(key: string): boolean {
    if (!hasLocalStorage()) return false;
    const k = String(key);
    // Скасовуємо відкладений запис, інакше пізніше перезапише null після видалення.
    const timer = pendingTimers.get(k);
    if (timer) {
      clearTimeout(timer);
      pendingTimers.delete(k);
    }
    pendingValues.delete(k);
    lastWrittenCache.delete(k);
    try {
      localStorage.removeItem(k);
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
    if (!hasLocalStorage()) return;
    const k = String(key);
    const nextStr = safeStringify(value);
    if (nextStr === undefined) return;

    const lastStr = lastWrittenCache.get(k);
    const hasPending = pendingTimers.has(k);
    if (!hasPending && lastStr === nextStr) {
      return; // Дані не змінились — запис не потрібен.
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

  // Гарантований flush на приховуванні сторінки — щоб не втратити останні зміни.
  if (
    typeof window !== "undefined" &&
    typeof window.addEventListener === "function"
  ) {
    const flush = () => flushPendingWrites();
    try {
      window.addEventListener("beforeunload", flush);
      window.addEventListener("pagehide", flush);
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") flush();
        });
      }
    } catch {
      /* SSR / restricted env */
    }
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
