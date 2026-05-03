/**
 * `useLocalStorageState<T>` — `useState`-like hook with localStorage persistence.
 *
 * Replaces the very common pattern of:
 *   const [v, setV] = useState<T>(() => readJSON(key, fallback));
 *   useEffect(() => writeJSON(key, v), [key, v]);
 *
 * The hook:
 *  - reads synchronously in the state initializer so there is no first-paint
 *    flicker from `undefined → stored value`;
 *  - swallows storage errors (quota, private mode, disabled) via the shared
 *    `safeReadLS` / `safeWriteLS` helpers;
 *  - optionally validates the stored value with a type guard and falls back
 *    to `initialValue` if the stored shape is unexpected;
 *  - optionally debounces writes (useful for large payloads written many
 *    times per second, e.g. a budgets list the user is dragging);
 *  - does not subscribe to cross-tab `storage` events by default — most
 *    call sites are user-owned UI state, and opting in via a listener is
 *    still available by reading `safeReadLS` on focus/visibility if needed.
 *
 * Signature matches `useState<T>` as closely as possible so swapping in is
 * mechanical.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { safeReadLS } from "@shared/lib/storage/storage";

export interface UseLocalStorageStateOptions<T> {
  /**
   * Runtime shape guard. Called with the raw parsed value from storage;
   * should return `true` when the value is structurally compatible with
   * `T`. If absent, any parsed value is accepted.
   */
  validate?: (raw: unknown) => raw is T;
  /**
   * Debounce window (ms) between the last `setValue` call and the actual
   * localStorage write. Use for hot paths that update many times per frame
   * (drag/resize, typing). 0 / undefined means write immediately inside
   * the effect.
   */
  debounceMs?: number;
  /**
   * Store the value as a raw string (no JSON.parse / JSON.stringify).
   * Shortcut for `serialize: (v) => v`, `deserialize: (raw) => raw`.
   * Useful for legacy keys that were written as bare strings (e.g.
   * "calendar" / "stats" rather than `"\"calendar\""`) — switching to
   * JSON would silently invalidate every existing user's preference.
   * Only meaningful when `T` is `string`.
   */
  raw?: boolean;
  /**
   * Custom serializer. Defaults to `JSON.stringify`.
   */
  serialize?: (value: T) => string;
  /**
   * Custom deserializer. Defaults to `JSON.parse`. Can return anything —
   * the result is narrowed by `validate` (if provided) or trusted as `T`.
   */
  deserialize?: (raw: string) => unknown;
}

function resolveInitial<T>(initial: T | (() => T)): T {
  return typeof initial === "function" ? (initial as () => T)() : initial;
}

export function useLocalStorageState<T>(
  key: string,
  initialValue: T | (() => T),
  options: UseLocalStorageStateOptions<T> = {},
): [T, Dispatch<SetStateAction<T>>] {
  const { validate, debounceMs, raw, serialize, deserialize } = options;
  const effectiveSerialize =
    serialize ?? (raw ? (v: T) => String(v) : undefined);
  const effectiveDeserialize =
    deserialize ?? (raw ? (r: string) => r : undefined);

  // Stable ref for the latest options so the read/write effects don't
  // re-subscribe on every render if the caller inlines an options object.
  const optionsRef = useRef({
    validate,
    serialize: effectiveSerialize,
    deserialize: effectiveDeserialize,
  });
  optionsRef.current = {
    validate,
    serialize: effectiveSerialize,
    deserialize: effectiveDeserialize,
  };

  const [value, setValue] = useState<T>(() => {
    const fallback = resolveInitial(initialValue);
    if (typeof localStorage === "undefined") return fallback;
    try {
      const storedRaw = localStorage.getItem(key);
      if (storedRaw === null) return fallback;
      const parsed = effectiveDeserialize
        ? effectiveDeserialize(storedRaw)
        : JSON.parse(storedRaw);
      if (validate && !validate(parsed)) return fallback;
      return (parsed ?? fallback) as T;
    } catch {
      // `safeReadLS` handles this too but we need the raw path above so a
      // custom deserializer can own the parsing. Fall through to fallback.
      return safeReadLS<T>(key, fallback) ?? fallback;
    }
  });

  // Track the key the last write was for — if `key` changes between
  // renders we re-initialize state from the new slot on the next read.
  const lastKeyRef = useRef(key);
  useEffect(() => {
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(key);
      const { deserialize: d, validate: v } = optionsRef.current;
      if (raw === null) {
        setValue(resolveInitial(initialValue));
        return;
      }
      const parsed = d ? d(raw) : JSON.parse(raw);
      if (v && !v(parsed)) {
        setValue(resolveInitial(initialValue));
        return;
      }
      setValue((parsed ?? resolveInitial(initialValue)) as T);
    } catch {
      setValue(resolveInitial(initialValue));
    }
    // Intentionally depend only on `key` — `initialValue` by design is a
    // seed and changing it after mount should not re-initialise state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Skip the write on the very first render: `value` was just read from
  // storage (or is the seeded initial for a missing key), so writing it
  // back is either a no-op or an unwanted side-effect on first paint.
  // Subsequent `setValue` calls go through this effect normally.
  const isFirstWriteRef = useRef(true);
  useEffect(() => {
    if (typeof localStorage === "undefined") return undefined;
    if (isFirstWriteRef.current) {
      isFirstWriteRef.current = false;
      return undefined;
    }
    const write = () => {
      const { serialize: s } = optionsRef.current;
      try {
        const raw = s ? s(value) : JSON.stringify(value);
        localStorage.setItem(key, raw);
      } catch {
        /* quota / private mode — best-effort */
      }
    };
    if (!debounceMs || debounceMs <= 0) {
      write();
      return undefined;
    }
    const id = setTimeout(write, debounceMs);
    return () => clearTimeout(id);
  }, [key, value, debounceMs]);

  const setStable = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    setValue(next);
  }, []);

  return [value, setStable];
}
