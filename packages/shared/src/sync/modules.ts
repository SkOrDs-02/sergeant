/**
 * Cross-platform cloud-sync module registry.
 *
 * Single source of truth for which `STORAGE_KEYS.*` belong to which
 * sync module on web (localStorage) and mobile (MMKV). Lives in
 * `@sergeant/shared` so the two platforms cannot drift — see PR #007
 * in `docs/planning/storage-roadmap.md`.
 *
 * The values listed here are the **union** across platforms. Each
 * platform's sync engine collects only the keys that actually exist
 * in its local store; missing keys are omitted from the push payload
 * via `collectModuleData` / `buildModulesPayload` (see
 * `apps/{web,mobile}/src/{core/cloudSync,sync}/engine/buildPayload.ts`).
 *
 * **Why list keys from the other platform?** The server stores
 * `module_data.<module>` as a single JSONB blob. If web pushes a
 * blob without `FIZRUK_DAILY_LOG`, the server overwrites the field
 * on disk and mobile gets it nulled on the next pull. Listing the
 * key here makes both clients aware of it; the platform that does
 * not store the key simply skips it during build (round-trip is
 * lossless from the other platform's perspective).
 *
 * Storage keys themselves live in `../lib/storageKeys`. Platform
 * sync-bookkeeping keys (e.g. `SYNC_VERSIONS`, `MOBILE_SYNC_VERSIONS`)
 * are intentionally NOT in this registry — they are metadata, not
 * payload, and live in each platform's `config.ts`.
 */
import { STORAGE_KEYS } from "../lib/storageKeys";

export const SYNC_MODULES = {
  // finyk — removed from SYNC_MODULES in PR #039 (storage-roadmap
  // Stage 4). The nineteen `finyk_*` LS/MMKV keys (hidden, budgets,
  // subs, assets, debts, recv, hidden_txs, monthly_plan, tx_cats,
  // mono_debt_linked, networth_history, tx_splits, custom_cats,
  // tx_cache, info_cache, tx_cache_last_good, show_balance,
  // manual_expenses, tx_filters) are no longer pushed to / pulled
  // from `module_data.finyk`; cross-device sync moved to the
  // per-table `finyk_*` SQLite mirror plus the op-log pipeline
  // (PR #035 schema, PR #036 dual-write, PR #037 read overlay,
  // PR #038 Mono client-side mirror). The Monobank PAT (FINYK_TOKEN)
  // was already excluded — server-only, see `no-finyk-token-in-storage`
  // ESLint rule and PR #002. The dedicated `no-restricted-syntax`
  // guard in `eslint.config.js` blocks new direct reads of the
  // nineteen tracked finyk-prefixed STORAGE_KEYS entries outside the
  // canonical finyk module wrappers, mirroring the fizruk retirement
  // in PR #030 and the nutrition retirement in PR #034.
  // fizruk — removed from SYNC_MODULES in PR #030 (storage-roadmap
  // Stage 4). The eleven `fizruk_*_v1` LS/MMKV keys are no longer
  // pushed to / pulled from `module_data.fizruk`; cross-device sync
  // moved to the per-table `fizruk_*` SQLite mirror plus the op-log
  // pipeline (PR #027 schema, PR #028 dual-write, PR #029 web reads,
  // PR #029a mobile reads). The dedicated `no-restricted-syntax`
  // guard in `eslint.config.js` blocks new direct reads of the
  // eleven tracked fizruk-prefixed STORAGE_KEYS entries (workouts,
  // custom_exercises, measurements, templates, selected_template,
  // active_workout, active_program, plan_template, monthly_plan,
  // wellbeing, daily_log) outside the canonical fizruk module
  // wrappers, mirroring the routine retirement in PR #026.
  // nutrition — removed from SYNC_MODULES in PR #034 (storage-roadmap
  // Stage 4). The five `nutrition_*_v1` LS/MMKV keys are no longer
  // pushed to / pulled from `module_data.nutrition`; cross-device
  // sync moved to the per-table `nutrition_*` SQLite mirror plus the
  // op-log pipeline (PR #031 schema, PR #032 dual-write, PR #033 web
  // and mobile reads). The dedicated `no-restricted-syntax` guard in
  // `eslint.config.js` blocks new direct reads of the five tracked
  // nutrition-prefixed STORAGE_KEYS entries (log, pantries,
  // active_pantry, prefs, saved_recipes) outside the canonical
  // nutrition module wrappers, mirroring the fizruk retirement in
  // PR #030.
  profile: {
    keys: [STORAGE_KEYS.USER_PROFILE, STORAGE_KEYS.HUB_BIOMETRICS],
  },
} as const;

export type ModuleName = keyof typeof SYNC_MODULES;

/**
 * Hard cap on the offline queue length. Beyond this we drop the
 * oldest entries to keep storage usage bounded for users offline
 * for extended periods.
 *
 * PR #009 (storage-roadmap Stage 1) raised this from 50 to 10 000
 * once web's offline queue moved off localStorage (~5 MB cap) onto
 * IDB (multi-GB practical cap) via `apps/web/src/core/cloudSync/
 * storage/syncMetaStore.ts`. Mobile (MMKV) had no comparable cap
 * but inherits the same value so cross-platform replay parity holds:
 * a user who goes offline for two weeks on web and three on mobile
 * has the same retention guarantees on both.
 */
export const MAX_OFFLINE_QUEUE = 10_000;

/**
 * Per-entry retry policy for the offline queue (PR #040, storage-roadmap
 * Stage 5). When a queued push entry has been replayed and failed
 * `MAX_QUEUE_ATTEMPTS` consecutive times — i.e. every replay attempt
 * since the entry was first enqueued has thrown — the entry is moved
 * out of the live queue into a separate dead-letter store
 * (`SYNC_META_KEYS.DEAD_LETTER_QUEUE` on web; `SYNC_DEAD_LETTER_QUEUE`
 * MMKV key on mobile) so the live queue does not retry it forever.
 *
 * The threshold is conservative on purpose: most push failures are
 * transient (network, 5xx, brief auth blips) and resolve well below
 * ten attempts, while a payload that has hit ten cumulative failures
 * is almost always a structural problem (malformed module data,
 * server schema mismatch) that needs human triage rather than another
 * automated retry. Dead-lettered entries can be inspected via
 * `getDeadLetterEntries` and re-enqueued via the manual
 * `replayDeadLetters` helper once the underlying issue is fixed.
 *
 * Counts increment per replay batch (one per `replayOfflineQueue`
 * failure), not per `retryAsync` inner attempt — the intra-batch
 * exponential-backoff retries are hidden bookkeeping. So a queue
 * entry takes at minimum N=10 successive replay-cycle failures to
 * be dead-lettered, never less.
 */
export const MAX_QUEUE_ATTEMPTS = 10;

/**
 * Flat read-only view of every storage key registered with any sync
 * module. Used by web's `storagePatch` to decide whether a write
 * should be enqueued, and by mobile's `useSyncedStorage` to
 * detect tracked keys at hook-call time.
 */
export const ALL_TRACKED_KEYS: ReadonlySet<string> = new Set(
  Object.values(SYNC_MODULES).flatMap((m) => m.keys),
);

/**
 * Reverse lookup: which module owns a given storage key, or `null`
 * if it is not tracked. Linear scan is fine because the registry is
 * small (~30 entries) and lookups happen at write-time, not in hot
 * paths.
 */
export function keyToModule(key: string): ModuleName | null {
  for (const [mod, config] of Object.entries(SYNC_MODULES)) {
    if ((config.keys as readonly string[]).includes(key)) {
      return mod as ModuleName;
    }
  }
  return null;
}
