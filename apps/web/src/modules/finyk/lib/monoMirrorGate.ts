/**
 * Read-path pub-sub for the Mono cache mirror (PR #038).
 *
 * Mirrors `sqliteReadGate.ts` (PR #037) — a tiny in-process pub-sub
 * so consumers (currently `useMonobankWebhook`) re-render after the
 * mirror cache is refreshed.
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

/**
 * React hook that re-renders whenever
 * {@link notifyFinykMonoMirrorRefresh} fires.
 */
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
