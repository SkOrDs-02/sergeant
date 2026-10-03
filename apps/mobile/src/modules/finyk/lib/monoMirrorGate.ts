/**
 * Read-path gate + subscription for the Mono cache mirror (mobile).
 *
 * Mirrors `apps/web/src/modules/finyk/lib/monoMirrorGate.ts`. The
 * mobile Finyk module exposes Mono transactions through
 * `transactionsStore.ts` (MMKV-backed) — the SQLite cache overlay
 * fires unconditionally. The pub-sub here lets that overlay re-render
 * after every refresh.
 */

import { useSyncExternalStore } from "react";

let cacheTick = 0;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): number {
  return cacheTick;
}

/** Tick counter that bumps every time {@link notifyFinykMonoMirrorRefresh} fires. */
export function useFinykMonoMirrorTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Bump the tick + notify subscribers. Called after every refresh. */
export function notifyFinykMonoMirrorRefresh(): void {
  cacheTick += 1;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* noop — listeners must never break notify */
    }
  }
}

/** Test-only escape hatch: clears subscribers + resets tick. */
export function __resetFinykMonoMirrorGateForTests(): void {
  cacheTick = 0;
  listeners.clear();
}
