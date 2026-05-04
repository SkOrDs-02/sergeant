/**
 * Centralized, opt-in debug logger for the cloud-sync subsystem.
 *
 * Silent in production by default. Turned on when any of:
 *   - `import.meta.env.DEV` is true (vite dev build), OR
 *   - `localStorage.HUB_DEBUG_SYNC === "1"` (runtime opt-in without a rebuild)
 *
 * Writes go through `console.debug` so they stay out of the default
 * production console view. Callers never need a `try/catch` — the logger
 * itself swallows any throw (e.g. jsdom without CustomEvent patched,
 * localStorage disabled, SSR).
 */

import type { SyncError, SyncState } from "./types";

type LogPayload = Record<string, unknown> | undefined;

function isEnabled(): boolean {
  try {
    const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
    if (env?.DEV) return true;
  } catch {
    /* import.meta.env unavailable (tests, ssr) — fall through */
  }
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("HUB_DEBUG_SYNC") === "1";
    }
  } catch {
    /* localStorage can throw in private mode / jsdom edge cases */
  }
  return false;
}

function write(event: string, payload?: LogPayload): void {
  if (!isEnabled()) return;
  try {
    if (payload === undefined) {
      console.debug(`[cloud-sync] ${event}`);
    } else {
      console.debug(`[cloud-sync] ${event}`, payload);
    }
  } catch {
    /* never let logging break the caller */
  }
}

export const syncLog = {
  enqueue: (info: { key?: string; module?: string | null }) =>
    write("enqueue", info),
  scheduleSync: (info: { reason: "online" | "change" | "periodic" }) =>
    write("schedule", info),
  syncStart: (info?: { syncId?: number }) => write("sync:start", info),
  syncSuccess: (info: { at: Date; syncId?: number }) =>
    write("sync:success", { at: info.at.toISOString(), syncId: info.syncId }),
  syncError: (info: { message: string; error?: SyncError; syncId?: number }) =>
    write("sync:error", info),
  stateChange: (info: { from: SyncState; to: SyncState; syncId?: number }) =>
    write("state", info),
  retry: (info: { attempt: number; delay: number; label?: string }) =>
    write("retry", info),
  replayDeadLetter: (info: { count: number }) =>
    write("replay:dead-letter", info),
  supersededCallback: (info: {
    kind: "onStart" | "onSuccess" | "onError" | "onSettled";
    staleSyncId: number;
    activeSyncId: number;
  }) => write("superseded", info),
};
