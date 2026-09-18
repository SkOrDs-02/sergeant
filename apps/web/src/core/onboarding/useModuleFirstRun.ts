/**
 * Per-module "first run" tracker.
 *
 * Replaces the standalone `<ModuleFirstRunGoalSheet />` (PR-2 of the
 * FTUX rework, now retired) which asked the user to set a goal in a
 * decoupled bottom sheet and persisted that answer to the hub-scoped
 * `OnboardingGoals` store. The user fed back that the sheet duplicated
 * fields the module itself already owned (e.g. nutrition kcal/Б/Ж/В
 * lives on the Menu page, finyk monthly plan lives on Budgets) and
 * that the answers never propagated to those canonical homes — making
 * the first-run prompt feel hollow.
 *
 * The new flow is "show the user where the goal actually lives":
 *
 *   1. Each module reads `useModuleFirstRun(<moduleId>)` on its app
 *      shell.
 *   2. When `firstRun === true`, the module routes to the canonical
 *      goal-setting surface and renders a one-time
 *      `<FirstRunHintBanner />` next to the editor inputs.
 *   3. The banner's dismiss CTA (or the user simply editing the
 *      relevant field) calls `markSeen()`, flipping the same
 *      localStorage flag the retired sheet used. The flag's name is
 *      preserved verbatim so users who already saw the sheet do not
 *      get a stale banner.
 *
 * The flag namespace is `sergeant.onboarding.module_first_seen.<id>.v1`
 * — matching the constant previously inlined in
 * `ModuleFirstRunGoalSheet.tsx` and mirrored by
 * `tests/utils/seedFTUX.ts` (`MODULE_FIRST_SEEN_KEY_PREFIX`). Any
 * future change to this namespace must update both call sites.
 */

import { useCallback, useState } from "react";
import {
  safeReadStringLSDurable,
  safeWriteStringLSDurable,
  safeRemoveLSDurable,
} from "@shared/lib/storage/storage";
import { useStorageReady } from "../db/storageReady";

const FIRST_SEEN_KEY_PREFIX = "sergeant.onboarding.module_first_seen.";
const FIRST_SEEN_KEY_SUFFIX = ".v1";

/** Module ids that participate in the per-module first-run flow. */
export const MODULE_FIRST_RUN_IDS = [
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
] as const;
export type ModuleFirstRunId = (typeof MODULE_FIRST_RUN_IDS)[number];

function firstSeenKey(moduleId: string): string {
  return `${FIRST_SEEN_KEY_PREFIX}${moduleId}${FIRST_SEEN_KEY_SUFFIX}`;
}

// The seen flag is written on dismiss and immediately followed by the
// user reloading the app. Routed through the plain `webKVStore` path,
// the write lands only in the SQLite warm-cache and fans out to a
// fire-and-forget OPFS write-back that a hard reload can race past — so
// the post-reload warm-cache scan misses it and the banner re-appears
// every session. The durable helpers ALSO mirror synchronously to the
// `localStorage` fallback that `bootstrapKvStore()` re-seeds the warm
// cache from, closing the race (same fix the theme choice uses).

function readFirstSeen(moduleId: string): boolean {
  return safeReadStringLSDurable(firstSeenKey(moduleId)) === "1";
}

function writeFirstSeen(moduleId: string): void {
  safeWriteStringLSDurable(firstSeenKey(moduleId), "1");
}

export interface UseModuleFirstRun {
  /** True the very first time `moduleId` is rendered post-mount. */
  firstRun: boolean;
  /** Persist the seen flag and flip `firstRun` to false in this tab. */
  markSeen: () => void;
}

/**
 * Read + write the per-module first-run flag.
 *
 * The hook resolves `firstRun` once the persistent store is ready (see
 * {@link useStorageReady}), then keeps that value across re-renders (e.g. tab
 * switches inside the same module) so a module that opens its goal editor on
 * first render does not snap shut after the user dismisses the banner. To
 * explicitly close out the first-run surface, call `markSeen()`.
 *
 * Storage-readiness gate: the seen flag lives in the SQLite-backed warm-cache,
 * which is empty until `bootstrapKvStore()` settles. Reading it during the cold
 * boot window would report EVERY returning user as "first run" and route them
 * to the module's first-run surface on a hard reload — `/finyk/transactions` →
 * `/finyk/budgets`, `/nutrition/start` → `/nutrition/menu`. So while
 * `storageReady` is `false` we hold `firstRun` at `false` (no routing); the real
 * value is resolved once, when the gate flips `true`. Consumers
 * (`useNutritionFirstRun`, `FinykApp`) already key their one-shot routing effect
 * on `firstRun` flipping truthy, so they pick up the async resolution for free.
 *
 * `null` `moduleId` is accepted so callers can guard their own mount
 * (e.g. while waiting for an async resolve) without juggling a nested
 * branch — it returns `firstRun: false` and a no-op `markSeen`.
 */
export function useModuleFirstRun(moduleId: string | null): UseModuleFirstRun {
  const storageReady = useStorageReady();

  const [firstRun, setFirstRun] = useState<boolean>(() =>
    moduleId !== null && storageReady ? !readFirstSeen(moduleId) : false,
  );

  const [prevModuleId, setPrevModuleId] = useState(moduleId);
  const [prevStorageReady, setPrevStorageReady] = useState(storageReady);
  if (moduleId !== prevModuleId || storageReady !== prevStorageReady) {
    setPrevModuleId(moduleId);
    setPrevStorageReady(storageReady);
    if (moduleId === null || !storageReady) {
      setFirstRun(false);
    } else {
      setFirstRun(!readFirstSeen(moduleId));
    }
  }

  const markSeen = useCallback(() => {
    if (!moduleId) return;
    writeFirstSeen(moduleId);
    setFirstRun(false);
  }, [moduleId]);

  return { firstRun, markSeen };
}

/**
 * Test-only escape hatch: clear all first-seen flags. Mirrors the
 * helper previously exported from `ModuleFirstRunGoalSheet.tsx` so
 * specs that drove the retired sheet keep working unchanged.
 */
export function resetModuleFirstSeen(): void {
  for (const id of MODULE_FIRST_RUN_IDS) {
    safeRemoveLSDurable(firstSeenKey(id));
  }
}
