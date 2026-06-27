/**
 * Thin web adapter over `@sergeant/shared/lib/onboarding`. The shared
 * module owns key constants, the existing-data heuristic, the
 * done-flag lifecycle and the splash taxonomy (icons / teasers / chip
 * order). This file binds them to a `window.localStorage`-backed
 * `KVStore` so existing call-sites (`App.tsx`, `OnboardingWizard.tsx`,
 * `WelcomeScreen.tsx`) keep the exact same API they had before the
 * mobile port.
 */

import {
  buildFinalPicks as sharedBuildFinalPicks,
  hasExistingData as sharedHasExistingData,
  isOnboardingCompletedFired as sharedIsOnboardingCompletedFired,
  isOnboardingDone as sharedIsOnboardingDone,
  markOnboardingCompletedFired as sharedMarkOnboardingCompletedFired,
  markOnboardingDone as sharedMarkOnboardingDone,
  shouldShowOnboarding as sharedShouldShowOnboarding,
} from "@sergeant/shared";
import { safeReadStringLS, webKVStore } from "@shared/lib/storage/storage";
import { DEMO_FLAG_KEY } from "./seedDemoData/keys";

/**
 * True when the onboarding splash should render on this cold start.
 * Matches the pre-extraction behaviour byte-for-byte (the shared
 * helper eagerly marks "done" when it finds pre-existing data).
 */
export function shouldShowOnboarding(): boolean {
  return sharedShouldShowOnboarding(webKVStore);
}

export function markOnboardingDone(): void {
  sharedMarkOnboardingDone(webKVStore);
}

export function isOnboardingDone(): boolean {
  return sharedIsOnboardingDone(webKVStore);
}

export function hasExistingData(): boolean {
  return sharedHasExistingData(webKVStore);
}

/**
 * PR-07 — record that the `onboarding_completed` PostHog event has
 * already fired for this account on this device. See the JSDoc on
 * `ONBOARDING_COMPLETED_FIRED_KEY` in `@sergeant/shared/lib/onboarding`
 * for the rationale.
 */
export function markOnboardingCompletedFired(): void {
  sharedMarkOnboardingCompletedFired(webKVStore);
}

export function isOnboardingCompletedFired(): boolean {
  return sharedIsOnboardingCompletedFired(webKVStore);
}

/**
 * True when the local store currently holds a seeded demo payload.
 *
 * Light synchronous flag read (`DEMO_FLAG_KEY` lives in the
 * constants-only `seedDemoData/keys` module) so call-sites on the hub
 * critical path can gate demo-only behaviour without pulling the heavy
 * seeding bundle into the entry chunk — mirrors `maybeRunOnboarding`'s
 * cheap `inDemo` probe. Used to suppress returning-user chrome (e.g. the
 * "What's new" modal) while the visitor is just exploring the example.
 */
export function isDemoActive(): boolean {
  return safeReadStringLS(DEMO_FLAG_KEY) === "1";
}

/**
 * Synthetic user id used to scope SQLite rows for a demo session.
 *
 * Demo mode bypasses auth, so `useAuth().user?.id` is `null`. The
 * per-module SQLite read-boot hooks (and the residual `*_v1` LS ->
 * SQLite drain they run) are `userId`-gated, so without a stand-in id
 * the demo payload `seedDemoData()` writes to LS never reaches the
 * SQLite cache the migrated modules read — the modules render empty
 * while the hub cards show the seeded quick-stats. Booting the read
 * path under this stable id lets the residual import warm the global
 * read cache. Isolated from any real account id (real users read under
 * their own id and never see these rows).
 */
export const DEMO_LOCAL_USER_ID = "demo-local";

export { sharedBuildFinalPicks as buildFinalPicks };
