/**
 * Web cloud-sync configuration. The `SYNC_MODULES` registry,
 * `ModuleName` type, event names, queue cap, and key→module helper
 * are sourced from `@sergeant/shared` so web and mobile cannot drift
 * (single source of truth — see `docs/planning/storage-roadmap.md`
 * → PR #007). Only the localStorage-specific bookkeeping keys and
 * the SQLite read-path exclusion set live here.
 */
import { STORAGE_KEYS, type ModuleName } from "@sergeant/shared";

export {
  ALL_TRACKED_KEYS,
  MAX_OFFLINE_QUEUE,
  SYNC_EVENT,
  SYNC_MODULES,
  SYNC_STATUS_EVENT,
  keyToModule,
  type ModuleName,
} from "@sergeant/shared";

export const SYNC_VERSION_KEY = STORAGE_KEYS.SYNC_VERSIONS;
export const DIRTY_MODULES_KEY = STORAGE_KEYS.SYNC_DIRTY_MODULES;
export const MODULE_MODIFIED_KEY = STORAGE_KEYS.SYNC_MODULE_MODIFIED;
export const OFFLINE_QUEUE_KEY = STORAGE_KEYS.SYNC_OFFLINE_QUEUE;
export const MIGRATION_DONE_KEY = STORAGE_KEYS.SYNC_MIGRATION_DONE;

// ---------------------------------------------------------------------------
// Module exclusion (PR #025). When the SQLite read-path is active for a
// module the client stops pushing its LS blob to the server. The boot
// wiring registers which modules are excluded; the push/upload engine
// consults `isModuleSyncExcluded` before collecting LS data.
// ---------------------------------------------------------------------------
const excludedModules = new Set<ModuleName>();

export function setModuleSyncExcluded(
  mod: ModuleName,
  excluded: boolean,
): void {
  if (excluded) excludedModules.add(mod);
  else excludedModules.delete(mod);
}

export function isModuleSyncExcluded(mod: string): boolean {
  return excludedModules.has(mod as ModuleName);
}
