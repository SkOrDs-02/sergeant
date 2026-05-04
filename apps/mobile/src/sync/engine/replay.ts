/**
 * Drain the offline queue by re-pushing its last-known module
 * payloads. 1:1 behavioral port of
 * `apps/web/src/core/cloudSync/engine/replay.ts`:
 *
 *   - module-scoped re-entry guard prevents overlapping replays
 *     triggered by concurrent online-events or initialSync + pushDirty
 *   - collapse-first via `collectQueuedModules` so duplicate entries
 *     for the same module coalesce into one payload
 *   - only clear the queue on successful push — failure keeps it for
 *     a later retry
 */
import { collectQueuedModules } from "../queue/collectQueued";
import {
  clearOfflineQueue,
  getOfflineQueue,
  recordReplayBatchFailure,
} from "../queue/offlineQueue";
import { syncApi } from "../api";
import { retryAsync } from "./retryAsync";

// Module-scoped re-entry guard. The app mounts `useCloudSync` once, so
// a module-level flag is equivalent to the `replayingRef` the web hook
// used internally — and avoids threading a ref through engine layers.
let replaying = false;

export async function replayOfflineQueue(): Promise<void> {
  if (replaying) return;
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  const modulesToPush = collectQueuedModules(queue);
  if (Object.keys(modulesToPush).length === 0) {
    // Queue contained only corrupted / unknown entries — drop it so
    // we don't keep retrying nothing forever.
    clearOfflineQueue();
    return;
  }

  replaying = true;
  try {
    await retryAsync(() => syncApi.pushAll(modulesToPush), {
      label: "replayOfflineQueue",
    });
    clearOfflineQueue();
  } catch (err) {
    // Network / transport failure during replay must not break callers
    // (the scheduler chains `pushDirty` afterwards). Keep the queue
    // for later, but bump per-entry attempt counts so we eventually
    // dead-letter entries that fail forever instead of looping
    // indefinitely (PR #040).
    recordReplayBatchFailure(err);
  } finally {
    replaying = false;
  }
}

/** Test-only: reset the re-entry guard between suites. */
export function _resetReplayGuardForTest(): void {
  replaying = false;
}
