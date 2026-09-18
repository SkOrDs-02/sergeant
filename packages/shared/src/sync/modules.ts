/**
 * Cross-platform cloud-sync module registry — **legacy / decision-pending tombstone**.
 *
 * Status (2026-05): Practically empty. Only `profile` entry survives, and
 * it is kept here as a test-fixture for the ESLint parity-check
 * (`packages/eslint-plugin-sergeant-design/__tests__/no-raw-tracked-storage.parity.test.mjs`),
 * not as a runtime contract. **Do not add new entries here** — see
 * `packages/shared/src/lib/storageKeys.ts` top docstring for the
 * current op-log v2 onboarding flow.
 *
 * Historical shape (deleted between 2026-04 and 2026-05):
 *
 * - finyk (PR #039), fizruk (PR #030), nutrition (PR #034), routine
 *   (PR #026): every product module was lifted from the blob `module_data`
 *   path onto per-table SQLite mirrors driven by op-log v2 (storage-roadmap
 *   §Stage 4). `module_data` JSONB column was dropped by migration 046
 *   (Stage 7 PR #051); `/api/sync` endpoints now answer `410 Gone`
 *   (ADR-0047). v1 client engine (`apps/web/src/core/cloudSync/{engine,
 *   queue,conflict,storagePatch,enqueue}.ts`, mobile `sync/{config,api,
 *   useSyncedStorage}.ts`) was deleted in PR #052b/c.
 * - The companion ESLint guard `no-raw-tracked-storage` and per-module
 *   `no-restricted-syntax` rules in `eslint.config.js` still block direct
 *   reads of the retired tracked keys outside their canonical
 *   storage/dual-write wrappers — that mechanical guard is what kept the
 *   migration safe and is still useful, hence why this tombstone has not
 *   been deleted outright.
 * - Decision-pending: storage-roadmap §Stage 13 → B6 lists three
 *   options (keep / reduce to a single PROFILE_MODULE constant / drop
 *   altogether once `profile` is normalised into its own SQLite table).
 *   Nothing here is on a hot path, so the cleanup is parked.
 *
 * Layout: `STORAGE_KEYS.*` literals live in `../lib/storageKeys`.
 */
import { STORAGE_KEYS } from "../lib/storageKeys";

export const SYNC_MODULES = {
  // profile — never moved to the per-table SQLite mirror because it is
  // a tiny LWW blob (USER_PROFILE + HUB_BIOMETRICS) and there is no
  // cross-module query benefit. Listed here so the ESLint parity-check
  // (`no-raw-tracked-storage`) keeps treating raw `useLocalStorage`
  // calls on these two keys as a hard error on mobile.
  profile: {
    keys: [STORAGE_KEYS.USER_PROFILE, STORAGE_KEYS.HUB_BIOMETRICS],
  },
} as const;

export type ModuleName = keyof typeof SYNC_MODULES;

/**
 * Historical hard cap on the v1 offline queue length (LS-array on web,
 * MMKV on mobile). v2 outbox lives in SQLite (`sync_op_outbox`) and is
 * not bounded by this constant; nothing in the runtime reads it any more.
 *
 * Kept exported because the modules.test.ts self-test still asserts the
 * documented value (10 000, raised from 50 in PR #009 once web moved off
 * the 5MB localStorage cap onto IDB). Drop is decision-pending — see
 * storage-roadmap §Stage 13 → B6.
 */
export const MAX_OFFLINE_QUEUE = 10_000;

/**
 * Historical per-entry retry policy for the v1 offline queue. The v2
 * SQLite outbox uses its own dead-letter machinery
 * (`SyncEngineWriterRuntime.recoverAllDeadLetters`) and does not consult
 * this constant. Kept for the same reason as `MAX_OFFLINE_QUEUE` — see
 * the docstring above.
 */
export const MAX_QUEUE_ATTEMPTS = 10;

/**
 * Flat read-only view of every storage key registered with any sync
 * module. With only `profile` left in `SYNC_MODULES`, this is effectively
 * `{USER_PROFILE, HUB_BIOMETRICS}`. Used solely by tests + ESLint parity
 * fixture; the v2 op-log path has its own server-side
 * `OP_LOG_TABLE_REGISTRY` whitelist (`apps/server/src/modules/sync/syncV2.ts`).
 */
export const ALL_TRACKED_KEYS: ReadonlySet<string> = new Set(
  Object.values(SYNC_MODULES).flatMap((m) => m.keys),
);

/**
 * Reverse lookup: which module owns a given storage key, or `null`
 * if it is not tracked. Linear scan is fine because the registry is
 * small (currently 2 keys total).
 */
export function keyToModule(key: string): ModuleName | null {
  for (const [mod, config] of Object.entries(SYNC_MODULES)) {
    if ((config.keys as readonly string[]).includes(key)) {
      return mod as ModuleName;
    }
  }
  return null;
}
