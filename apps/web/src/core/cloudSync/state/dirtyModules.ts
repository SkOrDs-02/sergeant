import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { DIRTY_MODULES_KEY, MODULE_MODIFIED_KEY } from "../config";
import { emitStatusEvent } from "./events";

// Cross-tab awareness: when another tab marks a module dirty or clears it,
// emit a status event so this tab's sync hook re-evaluates. The write race
// (two tabs simultaneously doing read→modify→write) is inherent to
// localStorage, but its impact is limited — at worst one dirty mark is lost
// for one sync cycle, and it will be re-marked on the next mutation.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === DIRTY_MODULES_KEY || event.key === MODULE_MODIFIED_KEY) {
      emitStatusEvent();
    }
  });
}

export function getDirtyModules(): Record<string, true> {
  return safeReadLS<Record<string, true>>(DIRTY_MODULES_KEY, {}) || {};
}

export function getModuleModifiedTimes(): Record<string, string> {
  return safeReadLS<Record<string, string>>(MODULE_MODIFIED_KEY, {}) || {};
}

export function markModuleDirty(moduleName: string): void {
  const dirty = getDirtyModules();
  dirty[moduleName] = true;
  safeWriteLS(DIRTY_MODULES_KEY, dirty);
  const modified = getModuleModifiedTimes();
  modified[moduleName] = new Date().toISOString();
  safeWriteLS(MODULE_MODIFIED_KEY, modified);
  emitStatusEvent();
}

export function clearDirtyModule(moduleName: string): void {
  const dirty = getDirtyModules();
  delete dirty[moduleName];
  safeWriteLS(DIRTY_MODULES_KEY, dirty);
  emitStatusEvent();
}

export function clearAllDirty(): void {
  safeWriteLS(DIRTY_MODULES_KEY, {});
  // Reset the modified-times map too. Otherwise it grows unbounded across
  // every module that was ever dirtied on this device, wasting localStorage
  // and keeping stale snapshots for `pushDirty`'s mid-flight change check.
  safeWriteLS(MODULE_MODIFIED_KEY, {});
  emitStatusEvent();
}
