import { useSyncExternalStore } from "react";
import {
  safeReadLS,
  safeRemoveLS,
  safeWriteLS,
} from "@shared/lib/storage/storage";

/**
 * Persistent notice for the client-side outbox TTL purge.
 *
 * PR-T2 (`docs/work/specs/audits/2026-09-13-product-full-review.md` §
 * "Тиха втрата даних"): `purgeStaleTerminalOutbox`
 * (`@sergeant/db-schema/sqlite`, invoked via `sweepStaleTerminalOutbox`
 * from `@sergeant/shared` on every sync-engine boot in `singleton.ts`)
 * silently deletes terminal `sync_op_outbox` rows (`rejected` /
 * `dead_letter`) older than `SYNC_OP_OUTBOX_STALE_TTL_DAYS`. The
 * `SyncStatusSheet` "Помилки" pill the user might have been watching
 * disappears together with the underlying data, and nothing ever told
 * them a record was dropped — the TTL sweep protects against unbounded
 * local growth, but it did so by trading one silent-loss bug (the
 * unbounded DLQ) for another (the disappearing DLQ).
 *
 * This module records the last purge's count + timestamp durably (the
 * sweep runs at boot, before any UI has mounted, so the record must
 * survive to the moment `SyncStatusSheet`/`OfflineBanner` actually
 * render) and exposes a `useSyncExternalStore`-friendly subscription
 * for same-session reactivity.
 *
 * Deliberately a module-scoped in-memory pub/sub (mirrors
 * `cloudPullRequest.ts`) rather than `webKVStore.onChange`: the SQLite
 * warm-cache backend notifies same-tab writers, but the pre-bootstrap
 * `localStorage` fallback does not (DOM `storage`-event contract — see
 * `createWebKVStore` docstring in `packages/shared/src/storage/kv.ts`).
 * The in-memory bridge behaves identically regardless of which backend
 * `webKVStore` currently resolves to.
 */

export const OUTBOX_PURGE_NOTICE_KEY = "sync_outbox_purge_notice_v1";

export interface OutboxPurgeNotice {
  /** Total rows purged across every sweep recorded since the last dismiss. */
  readonly purged: number;
  /** ISO timestamp of the most recent sweep that contributed to `purged`. */
  readonly purgedAtIso: string;
}

let cached: OutboxPurgeNotice | null | undefined;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      setTimeout(() => {
        throw err;
      }, 0);
    }
  });
}

function loadFromStorage(): OutboxPurgeNotice | null {
  return safeReadLS<OutboxPurgeNotice>(OUTBOX_PURGE_NOTICE_KEY, null);
}

/**
 * Record that the boot-time TTL sweep purged `purged` terminal outbox
 * rows. No-op for a non-positive/invalid count.
 *
 * Accumulates across multiple sweeps in the same session — the singleton
 * boots the anon partition first and the per-user partition after
 * sign-in resolves, so a small later purge must never mask a larger
 * earlier one within the same page load.
 */
export function recordOutboxPurgeNotice(purged: number): void {
  if (!Number.isFinite(purged) || purged <= 0) return;
  const previous = cached !== undefined ? cached : loadFromStorage();
  const next: OutboxPurgeNotice = {
    purged: (previous?.purged ?? 0) + purged,
    purgedAtIso: new Date().toISOString(),
  };
  safeWriteLS(OUTBOX_PURGE_NOTICE_KEY, next);
  cached = next;
  notify();
}

/** Current snapshot, lazily loaded from storage on first access per session. */
export function readOutboxPurgeNotice(): OutboxPurgeNotice | null {
  if (cached === undefined) cached = loadFromStorage();
  return cached;
}

/** Acknowledge and clear the notice once the user has seen it. */
export function dismissOutboxPurgeNotice(): void {
  safeRemoveLS(OUTBOX_PURGE_NOTICE_KEY);
  cached = null;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getServerSnapshot(): OutboxPurgeNotice | null {
  return null;
}

/**
 * React hook mirroring the current outbox-purge notice. `null` once
 * dismissed or when nothing has ever been purged.
 */
export function useOutboxPurgeNotice(): OutboxPurgeNotice | null {
  return useSyncExternalStore(
    subscribe,
    readOutboxPurgeNotice,
    getServerSnapshot,
  );
}

/** Test-only: reset the in-memory cache/listeners between specs. */
export function __resetOutboxPurgeNoticeForTests(): void {
  cached = undefined;
  listeners.clear();
}
