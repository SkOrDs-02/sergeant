/**
 * Mobile cloud-sync configuration. The `SYNC_MODULES` registry,
 * `ModuleName` type, event names, queue cap, and key→module helper
 * are sourced from `@sergeant/shared` so web and mobile cannot drift
 * (single source of truth — see `docs/planning/storage-roadmap.md`
 * → PR #007). Only the MMKV-specific bookkeeping keys (prefixed
 * `mobile:` to avoid colliding with the web localStorage keys, see
 * `docs/mobile/react-native-migration.md` § 6.1) live here.
 *
 * The `ModuleName` identifiers (`finyk`, `fizruk`, `nutrition`,
 * `profile`) are kept identical to web because the server's
 * `/api/v1/sync/*` endpoints key module payloads by these exact
 * names.
 */
import { STORAGE_KEYS } from "@sergeant/shared";

export {
  ALL_TRACKED_KEYS,
  MAX_OFFLINE_QUEUE,
  SYNC_EVENT,
  SYNC_MODULES,
  SYNC_STATUS_EVENT,
  keyToModule,
  type ModuleName,
} from "@sergeant/shared";

export const SYNC_VERSION_KEY = STORAGE_KEYS.MOBILE_SYNC_VERSIONS;
export const DIRTY_MODULES_KEY = STORAGE_KEYS.MOBILE_SYNC_DIRTY_MODULES;
export const MODULE_MODIFIED_KEY = STORAGE_KEYS.MOBILE_SYNC_MODULE_MODIFIED;
export const OFFLINE_QUEUE_KEY = STORAGE_KEYS.MOBILE_SYNC_OFFLINE_QUEUE;
export const DEAD_LETTER_QUEUE_KEY = STORAGE_KEYS.MOBILE_SYNC_DEAD_LETTER_QUEUE;
export const MIGRATION_DONE_KEY = STORAGE_KEYS.MOBILE_SYNC_MIGRATION_DONE;
export const QUERY_CACHE_KEY = STORAGE_KEYS.MOBILE_QUERY_CACHE;
