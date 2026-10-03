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
  markOnboardingCompletedFired as sharedMarkOnboardingCompletedFired,
  ONBOARDING_DONE_KEY,
  shouldShowOnboarding as sharedShouldShowOnboarding,
} from "@sergeant/shared";
import {
  safeReadStringLSDurable,
  safeWriteStringLSDurable,
  webKVStore,
} from "@shared/lib/storage/storage";

/**
 * True when the onboarding splash should render on this cold start.
 * Matches the pre-extraction behaviour byte-for-byte (the shared
 * helper eagerly marks "done" when it finds pre-existing data).
 */
export function shouldShowOnboarding(): boolean {
  if (isOnboardingDone()) return false;
  const shouldShow = sharedShouldShowOnboarding(webKVStore);
  // `sharedShouldShowOnboarding` also closes the gate when it detects existing
  // domain data. Mirror that side effect durably so a standalone PWA reload
  // cannot reopen `/welcome` while the SQLite upsert is still flushing.
  if (!shouldShow) markOnboardingDone();
  return shouldShow;
}

export function markOnboardingDone(): void {
  safeWriteStringLSDurable(ONBOARDING_DONE_KEY, "1");
}

export function isOnboardingDone(): boolean {
  return safeReadStringLSDurable(ONBOARDING_DONE_KEY) === "1";
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

export { sharedBuildFinalPicks as buildFinalPicks };
