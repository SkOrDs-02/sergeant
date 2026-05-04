/**
 * Read-path gate + subscription for the Mono cache mirror (mobile).
 *
 * Mirrors `apps/web/src/modules/finyk/lib/monoMirrorGate.ts`. The
 * mobile Finyk module exposes Mono transactions through
 * `transactionsStore.ts` (MMKV-backed) — when the
 * `feature.finyk.sqlite_v2.mono_mirror` flag is on we overlay the
 * stored slice from the SQLite cache. The pub-sub here lets that
 * overlay re-render after every refresh.
 */

import { useSyncExternalStore } from "react";

import { useFlag } from "@/core/lib/featureFlags";

const MIRROR_FLAG_ID = "feature.finyk.sqlite_v2.mono_mirror";

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

/** Flag-gated read-overlay enable. */
export function useFinykMonoMirrorFlag(): boolean {
  return useFlag(MIRROR_FLAG_ID);
}

export interface FinykMonoMirrorGate {
  /** Current value of `feature.finyk.sqlite_v2.mono_mirror`. */
  readonly enabled: boolean;
  /**
   * Tick counter that bumps after every successful mirror refresh —
   * use as a `useEffect` dep so consumers re-overlay when the SQLite
   * cache warms.
   */
  readonly tick: number;
}

/**
 * Combined hook — returns `{ enabled, tick }` so consumers can key
 * a single `useEffect([enabled, tick], …)` on both values.
 */
export function useFinykMonoMirrorGate(): FinykMonoMirrorGate {
  const enabled = useFinykMonoMirrorFlag();
  const tick = useFinykMonoMirrorTick();
  return { enabled, tick };
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
