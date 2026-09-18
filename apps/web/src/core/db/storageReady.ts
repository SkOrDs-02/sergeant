/**
 * Last validated: 2026-06-16
 * Status: Active
 *
 * Persistent-storage readiness latch (cold-boot redirect-race fix).
 *
 * The web app keeps onboarding / first-run / "has existing data" state inside
 * the SQLite-backed `kv_store` warm-cache (see `kvStoreBoot.ts`). That cache is
 * populated by an **async** boot — `bootstrapKvStore()` lazy-loads ~700 KB of
 * sqlite-wasm, opens the persistent VFS (OPFS-SAH / kvvfs) and runs a `SELECT`
 * scan. Until it settles, `webKVStore` reads fall through to the raw
 * `localStorage` adapter, where the SQLite-backed keys (`hub_onboarding_done_v1`,
 * `sergeant.onboarding.module_first_seen.*`, …) are simply **absent** — they
 * live inside the `kvvfs-local-*` blob, not as plain LS keys.
 *
 * The consequence on a full page reload (F5 / deep-link / external nav): a route
 * guard that synchronously asks "is onboarding done? has this module been seen?"
 * reads the empty pre-boot store, concludes "no", and redirects — bouncing a
 * returning user to `/welcome`, or a deep-linked `/finyk/transactions` to
 * `/finyk/budgets`. Warm SPA navigation never hit this because the cache was
 * already in memory.
 *
 * This module exposes a tiny `useSyncExternalStore`-backed boolean so guards can
 * tell **"state = not done"** apart from **"state not loaded yet"**: while the
 * latch is `false` they render a splash instead of deciding; once it flips
 * `true` they re-evaluate against the resolved store.
 *
 * Lifecycle / ownership:
 *   - Defaults to `true` (optimistic). Any mount path that does NOT run the
 *     `main.tsx` boot sequence — unit tests, Storybook, SSR — therefore never
 *     blocks on a bootstrap that will never fire, and existing synchronous
 *     tests keep passing unchanged.
 *   - `main.tsx` calls {@link markStorageBooting} synchronously **before** the
 *     first React render (latch → `false`), then {@link markStorageReady} once
 *     `bootstrapKvStore()` has settled and the storage-dependent boot steps have
 *     run (latch → `true`).
 *   - It is a one-way, page-lifetime latch: a later logout / partition reset
 *     (which flips `kvStoreBoot.loaded` back to `false`) deliberately does NOT
 *     re-arm it, because no second `bootstrapKvStore()` runs without a reload —
 *     re-arming would wedge the guards on a splash forever.
 */

import { useSyncExternalStore } from "react";

// `true` by default — see the module docstring. `main.tsx` is the only producer
// that arms the gate for a real async boot.
let ready = true;
const listeners = new Set<() => void>();

function emit(): void {
  // Snapshot the set first: a listener may unsubscribe during notify.
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      /* a listener throw must never wedge the others or the boot sequence */
    }
  }
}

/**
 * Arm the readiness gate: declare that an async persistent-storage boot is in
 * flight, so guards render a splash instead of evaluating pre-boot state. Must
 * be called synchronously before the first React render. Idempotent.
 */
export function markStorageBooting(): void {
  if (!ready) return;
  ready = false;
  emit();
}

/**
 * Release the readiness gate: the boot attempt has settled (the SQLite
 * warm-cache loaded, or we fell back to `localStorage`). Reads now reflect the
 * resolved persistent store, so guards may evaluate onboarding / first-run
 * state. Idempotent.
 */
export function markStorageReady(): void {
  if (ready) return;
  ready = true;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Non-reactive snapshot of the latch. `true` once persistent storage has
 * resolved (or when no async boot is pending). Exposed for non-component
 * call-sites and tests; components should use {@link useStorageReady}.
 */
export function getStorageReadySnapshot(): boolean {
  return ready;
}

/**
 * `true` once the persistent KV warm-cache has resolved — or immediately when no
 * async boot is pending (tests / SSR / Storybook). While `false`, route and
 * per-module first-run guards MUST render a splash rather than evaluate
 * onboarding / first-run state: the pre-boot store is empty and would falsely
 * redirect a returning user (see the module docstring).
 */
export function useStorageReady(): boolean {
  return useSyncExternalStore(
    subscribe,
    getStorageReadySnapshot,
    getStorageReadySnapshot,
  );
}

/** Test-only escape hatch — reset the latch to its optimistic default. */
export function __resetStorageReadyForTests(): void {
  ready = true;
  listeners.clear();
}
