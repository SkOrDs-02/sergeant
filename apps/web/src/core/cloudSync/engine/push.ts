import { syncApi } from "@shared/api";
import { trackEvent, ANALYTICS_EVENTS } from "../../observability/analytics";
import { SYNC_MODULES } from "../config";
import { isModulePushSuccess } from "../conflict/pushSuccess";
import { addToOfflineQueue } from "../queue/offlineQueue";
import {
  clearAllDirty,
  clearDirtyModule,
  getDirtyModules,
  getModuleModifiedTimes,
} from "../state/dirtyModules";
import { setModuleVersion } from "../state/versions";
import type { EngineArgs, PushAllResponse } from "../types";
import { buildModulesPayload } from "./buildPayload";
import { replayOfflineQueue } from "./replay";
import { retryAsync } from "./retryAsync";

export type PushArgs = EngineArgs;

/**
 * Push all currently-dirty modules. Behavior matches the original
 * `pushDirty` in `useCloudSync.js`:
 *   - offline → enqueue and return
 *   - online  → replay any queued payload first, then push
 *   - success → clear dirty flags for modules whose modifiedAt did not
 *     advance during the request (mid-flight changes are preserved)
 *   - failure → re-queue the exact payload we attempted to push
 */
export async function pushDirty(args: PushArgs): Promise<void> {
  const { user, onStart, onSuccess, onError, onSettled } = args;
  const dirty = getDirtyModules();
  const dirtyMods = Object.keys(dirty);
  if (dirtyMods.length === 0) return;

  onStart();
  // Snapshot modified timestamps at push-start. After the server responds we
  // only clear a module's dirty flag if its modifiedAt hasn't advanced —
  // otherwise a change that happened mid-request would be silently dropped.
  const modifiedSnapshot = getModuleModifiedTimes();
  const modules = buildModulesPayload(dirtyMods, modifiedSnapshot);
  try {
    if (Object.keys(modules).length === 0) {
      clearAllDirty();
      onSuccess(new Date());
      return;
    }

    if (!navigator.onLine) {
      addToOfflineQueue({ type: "push", modules });
      return;
    }

    await replayOfflineQueue();

    const result = (await retryAsync(() => syncApi.pushAll(modules), {
      label: "pushDirty",
    })) as PushAllResponse;
    const currentModified = getModuleModifiedTimes();
    if (result?.results) {
      for (const [mod, r] of Object.entries(result.results)) {
        if (user?.id && r?.version) setModuleVersion(user.id, mod, r.version);
        if (!isModulePushSuccess(r)) continue;
        // Only clear dirty if no newer change landed while we were pushing.
        if (currentModified[mod] === modifiedSnapshot[mod]) {
          clearDirtyModule(mod);
        }
      }
    }

    onSuccess(new Date());
  } catch (err) {
    // Re-queue the exact payload we attempted to push rather than
    // re-collecting, which would race with changes that happened during the
    // failed request.
    if (Object.keys(modules).length > 0) {
      addToOfflineQueue({ type: "push", modules });
    }
    args.onErrorRaw?.(err);
    onError(err instanceof Error ? err.message : String(err));
  } finally {
    onSettled();
  }
}

/**
 * Push every sync-managed module regardless of dirty state. Used for manual
 * "sync now" actions. Same offline/online semantics as `pushDirty`, but on
 * success all dirty flags are cleared (not just those matching the snapshot).
 */
export async function pushAll(args: PushArgs): Promise<void> {
  const { user, onStart, onSuccess, onError, onSettled } = args;
  onStart();
  try {
    const modules = buildModulesPayload(
      Object.keys(SYNC_MODULES),
      getModuleModifiedTimes(),
    );
    if (Object.keys(modules).length === 0) {
      onSuccess(new Date());
      return;
    }

    if (!navigator.onLine) {
      addToOfflineQueue({ type: "push", modules });
      return;
    }

    const result = (await retryAsync(() => syncApi.pushAll(modules), {
      label: "pushAll",
    })) as PushAllResponse;
    if (user?.id && result?.results) {
      for (const [mod, r] of Object.entries(result.results)) {
        if (r?.version) setModuleVersion(user.id, mod, r.version);
      }
    }
    // Per-module clear замість `clearAllDirty()`: інакше при LWW-conflict-і
    // (`{ ok: true, conflict: true }`) dirty-флаг стирався мовчки, і
    // наступний pull накатував cloud → локальні зміни гинули. Лишаємо
    // conflict-модулі dirty для наступної ітерації push-у.
    const results = result?.results ?? {};
    const conflicted: string[] = [];
    for (const mod of Object.keys(modules)) {
      const r = results[mod];
      if (isModulePushSuccess(r)) {
        clearDirtyModule(mod);
      } else {
        conflicted.push(mod);
      }
    }
    if (conflicted.length > 0) {
      console.warn(
        "[cloudSync] pushAll: server rejected push for modules (kept dirty)",
        conflicted,
      );
      // PostHog: spike-и conflict-ів — сигнал регресії LWW-guard-а або
      // clock-drift-у. `modules` — лічильник, не імена, щоб не тягнути
      // module-level кардинальність у події.
      trackEvent(ANALYTICS_EVENTS.SYNC_CONFLICT_RESOLVED, {
        kind: "push",
        modules: conflicted.length,
      });
    }
    onSuccess(new Date());
  } catch (err) {
    args.onErrorRaw?.(err);
    onError(err instanceof Error ? err.message : String(err));
  } finally {
    onSettled();
  }
}
