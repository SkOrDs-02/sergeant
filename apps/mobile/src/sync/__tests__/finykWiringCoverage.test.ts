/**
 * Cloud-sync wiring coverage manifest for the `finyk` module.
 *
 * `SYNC_MODULES.finyk` lists every MMKV key that participates in
 * cloud sync. For each key, *some* mobile writer must call
 * `enqueueChange(key)` after the persisted mutation, otherwise edits
 * never mark the module dirty and are lost on a backup restore from
 * another device.
 *
 * This manifest is the single source of truth for that audit:
 *   - WIRED keys point at the test file that already exercises the
 *     mutator end-to-end and asserts `enqueueChange(key)` fires.
 *   - PENDING_NO_WRITER keys document keys whose mobile store has not
 *     been ported yet — their wiring will land in the same PR as the
 *     store. The set is checked against the registry below so the
 *     test fails the moment a new key is added without classifying it.
 *
 * Whenever a new Finyk store ports over to mobile, move its key from
 * `PENDING_NO_WRITER` into `WIRED` and add a unit test under the
 * matching path. The test below will fail if the union of the two
 * sets ever drifts from `SYNC_MODULES.finyk.keys`.
 */
import { STORAGE_KEYS } from "@sergeant/shared";

import { SYNC_MODULES } from "../config";

/**
 * Keys that already have a mobile writer + a passing enqueueChange
 * unit test. Path is informational — it tells the next reviewer where
 * to look when they need to verify the wiring.
 */
const WIRED: Record<string, string> = {
  // assetsStore.ts
  [STORAGE_KEYS.FINYK_ASSETS]:
    "src/modules/finyk/lib/__tests__/assetsStore.enqueue.test.ts",
  [STORAGE_KEYS.FINYK_DEBTS]:
    "src/modules/finyk/lib/__tests__/assetsStore.enqueue.test.ts",
  [STORAGE_KEYS.FINYK_RECV]:
    "src/modules/finyk/lib/__tests__/assetsStore.enqueue.test.ts",
  [STORAGE_KEYS.FINYK_HIDDEN]:
    "src/modules/finyk/lib/__tests__/assetsStore.enqueue.test.ts",

  // budgetsStore.ts
  [STORAGE_KEYS.FINYK_BUDGETS]:
    "src/modules/finyk/lib/__tests__/budgetsStore.enqueue.test.ts",
  [STORAGE_KEYS.FINYK_SUBS]:
    "src/modules/finyk/lib/__tests__/budgetsStore.enqueue.test.ts",
  [STORAGE_KEYS.FINYK_MONTHLY_PLAN]:
    "src/modules/finyk/lib/__tests__/budgetsStore.enqueue.test.ts",

  // transactionsStore.ts
  [STORAGE_KEYS.FINYK_MANUAL_EXPENSES]:
    "src/modules/finyk/lib/__tests__/transactionsStore.enqueue.test.ts",
  [STORAGE_KEYS.FINYK_TX_CATS]:
    "src/modules/finyk/lib/__tests__/transactionsStore.enqueue.test.ts",
  [STORAGE_KEYS.FINYK_TX_SPLITS]:
    "src/modules/finyk/lib/__tests__/transactionsStore.enqueue.test.ts",
  [STORAGE_KEYS.FINYK_HIDDEN_TXS]:
    "src/modules/finyk/lib/__tests__/transactionsStore.enqueue.test.ts",
  [STORAGE_KEYS.FINYK_TX_FILTERS]:
    "src/modules/finyk/lib/__tests__/transactionsStore.enqueue.test.ts",

  // FinykSection.tsx (settings → custom expense categories)
  [STORAGE_KEYS.FINYK_CUSTOM_CATS]:
    "src/core/settings/FinykSection.enqueue.test.tsx",
};

/**
 * Tracked keys with no mobile writer yet. Each entry must include the
 * upstream feature that owns the writer so we know which port unblocks
 * the wiring. Adding a key here is allowed; leaving a key uncategorised
 * (i.e. in neither set) is what fails the test.
 */
const PENDING_NO_WRITER: Record<string, string> = {
  // Monobank cached account/info blob — written by the mobile Monobank
  // client when ported (Phase 4+, see
  // `docs/mobile/react-native-migration.md` §6.2). The PAT itself
  // (`STORAGE_KEYS.FINYK_TOKEN`) is intentionally NOT in `SYNC_MODULES.finyk.keys`
  // and therefore not listed here — see `useMonoTokenMigration` and the
  // backend `mono_connection.token_ciphertext` for the canonical store.
  [STORAGE_KEYS.FINYK_INFO_CACHE]: "Monobank port (Phase 4+)",
  [STORAGE_KEYS.FINYK_TX_CACHE]: "Monobank port (Phase 4+)",
  [STORAGE_KEYS.FINYK_TX_CACHE_LAST_GOOD]: "Monobank port (Phase 4+)",
  [STORAGE_KEYS.FINYK_MONO_DEBT_LINKED]: "Monobank port (Phase 4+)",

  // Net-worth history — written by the analytics aggregator that has
  // not been ported. Will land alongside the Net-worth screen.
  [STORAGE_KEYS.FINYK_NETWORTH_HISTORY]: "Net-worth analytics port",

  // UI-only toggle for hiding balances on the Overview header. Will be
  // wired when the Overview header gains its visibility-toggle button.
  [STORAGE_KEYS.FINYK_SHOW_BALANCE]: "Overview header visibility toggle",
};

describe("SYNC_MODULES.finyk — enqueueChange wiring coverage", () => {
  const trackedKeys = SYNC_MODULES.finyk.keys as readonly string[];

  it("classifies every tracked finyk key as either WIRED or PENDING_NO_WRITER", () => {
    const classified = new Set([
      ...Object.keys(WIRED),
      ...Object.keys(PENDING_NO_WRITER),
    ]);

    const unclassified = trackedKeys.filter((k) => !classified.has(k));
    expect(unclassified).toEqual([]);
  });

  it("does not classify the same key in both WIRED and PENDING_NO_WRITER", () => {
    const overlap = Object.keys(WIRED).filter(
      (k) => PENDING_NO_WRITER[k] !== undefined,
    );
    expect(overlap).toEqual([]);
  });

  it("does not list keys outside the SYNC_MODULES.finyk registry", () => {
    const tracked = new Set(trackedKeys);
    const stray = [
      ...Object.keys(WIRED),
      ...Object.keys(PENDING_NO_WRITER),
    ].filter((k) => !tracked.has(k));
    expect(stray).toEqual([]);
  });
});
