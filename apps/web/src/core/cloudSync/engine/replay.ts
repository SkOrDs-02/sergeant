import { syncApi } from "@shared/api";
import { collectQueuedModules } from "../queue/collectQueued";
import {
  clearOfflineQueue,
  getOfflineQueue,
  hydrateOfflineQueueFromDisk,
} from "../queue/offlineQueue";
import { retryAsync } from "./retryAsync";

// Module-scoped re-entry guard. The original hook used a `replayingRef`; for
// a singleton hook instance (the app mounts `useCloudSync` once) a module-
// level flag is equivalent and avoids threading a ref through layers.
let replaying = false;

/**
 * Drain the offline queue by re-pushing its last-known module payloads. On
 * success the queue is cleared; on failure the queue is kept for later.
 * Re-entry during an already-in-flight replay is a no-op.
 */
export async function replayOfflineQueue(): Promise<void> {
  // Guard against re-entry: if an "online" event fires twice in quick
  // succession, or replay is triggered concurrently from initialSync and
  // pushDirty, we must not fire duplicate push requests for the same queue.
  if (replaying) return;
  // PR #009 — promote any LS-only queue from a previous app version into
  // IDB before we read it. Subsequent calls are cheap (cache short-circuit).
  await hydrateOfflineQueueFromDisk();
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  const modulesToPush = collectQueuedModules(queue);
  if (Object.keys(modulesToPush).length === 0) {
    // Queue contained only corrupted/unknown entries — drop it so we don't
    // keep retrying nothing forever.
    clearOfflineQueue();
    return;
  }

  replaying = true;
  try {
    await retryAsync(() => syncApi.pushAll(modulesToPush), {
      label: "replayOfflineQueue",
    });
    clearOfflineQueue();
  } catch {
    // Network/transport failure during replay must not break callers
    // (onOnline chains pushDirty afterwards). Keep the queue for later.
  } finally {
    replaying = false;
  }
}
