/**
 * `useSyncedStorage` — `useLocalStorage` + automatic cloud-sync wiring.
 *
 * Why this exists
 * ---------------
 * MMKV writes go straight to native, so unlike web (where writes
 * historically auto-marked modules dirty via `localStorage.setItem`
 * monkey-patch), every mobile hook that persists a tracked sync key
 * had to call `enqueueChange(key)` after each write. The Finyk and
 * Fizruk hooks silently shipped without that call until it was caught
 * manually, and the routineStore pattern only documented the convention
 * — it did not enforce it.
 *
 * `useSyncedStorage` collapsed the two-step "write + enqueue" into a
 * single hook so any future module that opts in could not forget. It
 * preserves the exact return shape of `useLocalStorage`
 * (`[value, setValue, remove]`) so it is a drop-in replacement.
 *
 * Post-PR-#052c
 * -------------
 * `enqueueChange` is a no-op (see `./enqueue.ts`); the v1 cloud-sync
 * engine that consumed the signal was dropped together with the
 * `engine/`, `queue/`, `state/` дерева у цьому PR. The wrapper still
 * exists so call-sites stay green and so the contract is restored when
 * mobile v2 op-log writer-runtime прокинеться в boot path (web
 * counterpart — `apps/web/src/core/syncEngine/syncEngineWriter.ts`).
 * Inside `useSyncedStorage` the `enqueueChange` call is harmless busy-
 * work; consumers can keep using the hook unchanged.
 */
import { useCallback } from "react";

import {
  useLocalStorage,
  type UseLocalStorageRemove,
  type UseLocalStorageReturn,
  type UseLocalStorageSetter,
} from "@/lib/storage";

import { enqueueChange } from "./enqueue";

/**
 * Drop-in replacement for `useLocalStorage` that automatically calls
 * `enqueueChange(key)` after every successful write or remove. The
 * underlying MMKV write happens first (synchronously, inside the
 * `useState` updater), so by the time `enqueueChange` runs the new
 * value is already persisted and the next sync push will pick it up.
 */
export function useSyncedStorage<T>(
  key: string,
  fallback: T,
): UseLocalStorageReturn<T> {
  const [value, setValueRaw, removeRaw] = useLocalStorage<T>(key, fallback);

  const setValue: UseLocalStorageSetter<T> = useCallback(
    (next) => {
      setValueRaw(next);
      enqueueChange(key);
    },
    [key, setValueRaw],
  );

  const remove: UseLocalStorageRemove = useCallback(() => {
    removeRaw();
    enqueueChange(key);
  }, [key, removeRaw]);

  return [value, setValue, remove];
}
