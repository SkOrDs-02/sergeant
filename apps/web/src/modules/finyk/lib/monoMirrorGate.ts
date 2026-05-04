/**
 * Read-path gate + subscription for the Mono cache mirror (PR #038).
 *
 * Mirrors `sqliteReadGate.ts` (PR #037) — a tiny in-process pub-sub
 * so consumers (currently `useMonobankWebhook`) re-render after the
 * mirror cache is refreshed. The flag is the user-facing
 * `feature.finyk.sqlite_v2.mono_mirror` toggle.
 */

import { useSyncExternalStore } from "react";
import { useFlag } from "../../../core/lib/featureFlags";

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

/**
 * React hook that re-renders whenever
 * {@link notifyFinykMonoMirrorRefresh} fires.
 */
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
   * use as a `useEffect` dep so consumers re-overlay when the
   * SQLite cache warms.
   */
  readonly tick: number;
}

/**
 * Combined hook — returns flag value + tick, parallel to
 * `useFinykSqliteReadGate()` (PR #037).
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
