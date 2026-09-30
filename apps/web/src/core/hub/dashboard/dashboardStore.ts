import { webKVStore } from "@shared/lib/storage/storage";

/**
 * `KVStore` adapter backed by `window.localStorage`. Used by shared
 * onboarding/engagement helpers (`countRealEntries`, `getActiveNudge`,
 * `recordLastActiveDate`, `shouldShowReengagement`) that are agnostic to
 * the storage backend (web LS vs. mobile MMKV).
 *
 * Re-exported under the legacy name for callers that imported the
 * adapter from this module before the `@sergeant/shared/storage/kv`
 * unification (PR #006). New code should import `webKVStore` directly
 * from `@shared/lib/storage`.
 */
export const localStorageStore = webKVStore;
