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
  isOnboardingDone as sharedIsOnboardingDone,
  markOnboardingDone as sharedMarkOnboardingDone,
  shouldShowOnboarding as sharedShouldShowOnboarding,
} from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";

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

export { sharedBuildFinalPicks as buildFinalPicks };
