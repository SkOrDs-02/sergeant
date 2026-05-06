/**
 * `useOnboardingState` — React state machine for the FTUX hero slot
 * (PR-12). Wraps the pure `resolveOnboardingHero` resolver from
 * `@sergeant/shared` and adds the storage / lifecycle plumbing the
 * dashboard previously kept inline.
 *
 * Why this lives in `apps/web` rather than `packages/shared`:
 * `useState`, `useCallback`, and the `vibePicks` storage helpers all
 * depend on web-specific bindings (`localStorage` / `webKVStore`).
 * The reusable bits — priority order, single-hero invariant, reason
 * vocabulary — already live in `packages/shared/src/lib/onboardingHero.ts`,
 * so the mobile port (PR-21 — "FTUX parity sweep") can re-use that
 * resolver while wiring its own MMKV-backed hook.
 *
 * Behavioural contract preserved 1:1 from `HubDashboard`:
 *   • FTUX hero hides as soon as the user dismisses (storage flag
 *     cleared + in-render boolean flipped) so the next priority
 *     winner takes the slot in the same render.
 *   • Soft-auth thresholds: 3 session-days for cold users, 2 session-
 *     days minimum after the first real entry so the celebration
 *     modal is not immediately followed by an auth nag.
 *   • TodayFocus availability is a caller-supplied boolean — the
 *     dashboard already owns `useDashboardFocus()` and we don't want
 *     to re-couple to it here.
 */

import { useCallback, useState } from "react";

import {
  resolveOnboardingHero,
  type OnboardingHeroId,
  type OnboardingHeroReason,
  type User,
} from "@sergeant/shared";

import {
  clearFirstActionPending,
  isFirstActionPending,
  isSoftAuthDismissed,
} from "./vibePicks";

/**
 * Days the user must have visited the dashboard before the soft-auth
 * nag fires for a *cold* user (no real entry yet). Mirrors the legacy
 * `SOFT_AUTH_SESSION_DAYS_THRESHOLD` constant from `HubDashboard.tsx`
 * before this refactor — exported so tests can reference it without
 * duplicating the magic number.
 */
export const SOFT_AUTH_SESSION_DAYS_THRESHOLD = 3;

/**
 * Minimum session-days the *post-first-entry* user must have before
 * the soft-auth nag fires. The lower threshold (vs. cold users) is
 * intentional — engaged users tolerate the nag earlier — but it is
 * still ≥ 2 so we never collide the auth prompt with the celebration
 * modal that fires on the first-entry session itself.
 */
export const SOFT_AUTH_AFTER_ENTRY_MIN_SESSION_DAYS = 2;

export interface UseOnboardingStateOptions {
  /** Current user record (or `null`/`undefined` if anonymous). When
   *  truthy, suppresses the soft-auth nag. */
  user: User | null | undefined;
  /** `detectFirstRealEntry()` resolved to `true`. Drives the cold-vs-
   *  post-first-entry split for the soft-auth threshold. */
  hasRealEntry: boolean;
  /** Number of distinct calendar-days the user has visited the hub.
   *  Use the `-1` sentinel during the first render (before
   *  `recordSessionDay()` resolves) so all FTUX gates stay closed. */
  sessionDays: number;
  /** `useDashboardFocus()` returned a non-null `focus` rec. The
   *  dashboard already computes this — passing it in keeps the hook
   *  decoupled from the focus implementation. */
  todayFocusAvailable: boolean;
  /** `nudges.ts:shouldShowReengagement(...)` resolved to `true`. */
  reengagementEligible: boolean;
  /** Optional auth-modal opener. The soft-auth nag is suppressed
   *  when this is missing — the card is useless without a way to
   *  open the modal it nags toward. */
  onShowAuth?: () => void;
}

export interface UseOnboardingStateResult {
  /** Resolved hero id from `resolveOnboardingHero`. `null` means
   *  no candidate is eligible (post-FTUX without focus rec, etc.). */
  hero: OnboardingHeroId | null;
  /** Why `hero` won — fed into `hub_hero_resolved` analytics if/when
   *  the dashboard fires the event. */
  reason: OnboardingHeroReason;
  /** All eligible candidates in priority order. The dashboard can
   *  use this to assert the single-hero invariant in dev or to
   *  surface conflict-rate analytics. */
  candidates: readonly OnboardingHeroId[];
  /** True when the FTUX hero is the slot winner. Cheaper to read
   *  than `hero === "first-action"` at the call site, and lets
   *  ancillary toggles (streak chip suppression, checklist gating)
   *  reference the same source of truth. */
  showFirstAction: boolean;
  /** True when the soft-auth nag is the slot winner. */
  showSoftAuth: boolean;
  /** True when the TodayFocus card is the slot winner (default). */
  showTodayFocus: boolean;
  /** True when the re-engagement card is the slot winner — note this
   *  card replaces the entire hero block on web, so the dashboard
   *  branches on this flag at a higher level. */
  showReengagement: boolean;
  /** Dismiss the FTUX hero. Clears `hub_first_action_pending_v1`
   *  (storage) and flips the in-render flag so the next-priority
   *  candidate (soft-auth or today-focus) takes the slot in the
   *  same render. */
  dismissFirstAction: () => void;
  /** Dismiss the soft-auth nag. Persists to storage so subsequent
   *  sessions also skip the card. */
  dismissSoftAuth: () => void;
}

/**
 * Compute soft-auth eligibility from the same inputs the legacy
 * `HubDashboard.showSoftAuth` derivation used.
 */
function computeSoftAuthEligible(
  user: User | null | undefined,
  softAuthDismissed: boolean,
  hasRealEntry: boolean,
  sessionDays: number,
  onShowAuth?: () => void,
): boolean {
  return (
    !user &&
    !softAuthDismissed &&
    typeof onShowAuth === "function" &&
    ((hasRealEntry && sessionDays >= SOFT_AUTH_AFTER_ENTRY_MIN_SESSION_DAYS) ||
      sessionDays >= SOFT_AUTH_SESSION_DAYS_THRESHOLD)
  );
}

/**
 * Pluggable storage hooks for tests. `useOnboardingState` always
 * defaults to the production `vibePicks.ts` helpers; tests inject
 * deterministic mocks via the second argument.
 */
export interface OnboardingStateStorage {
  isFirstActionPending: () => boolean;
  isSoftAuthDismissed: () => boolean;
  clearFirstActionPending: () => void;
}

const DEFAULT_STORAGE: OnboardingStateStorage = {
  isFirstActionPending,
  isSoftAuthDismissed,
  clearFirstActionPending,
};

export function useOnboardingState(
  options: UseOnboardingStateOptions,
  storage: OnboardingStateStorage = DEFAULT_STORAGE,
): UseOnboardingStateResult {
  const {
    user,
    hasRealEntry,
    sessionDays,
    todayFocusAvailable,
    reengagementEligible,
    onShowAuth,
  } = options;

  // Lazy initialisers: storage reads run once on mount, not on every
  // render. The booleans flip only via the explicit `dismiss*`
  // callbacks below.
  const [firstActionVisible, setFirstActionVisible] = useState(() =>
    storage.isFirstActionPending(),
  );
  const [softAuthDismissed, setSoftAuthDismissed] = useState(() =>
    storage.isSoftAuthDismissed(),
  );

  const softAuthEligible = computeSoftAuthEligible(
    user,
    softAuthDismissed,
    hasRealEntry,
    sessionDays,
    onShowAuth,
  );

  const resolution = resolveOnboardingHero({
    reengagementEligible,
    firstActionVisible,
    softAuthEligible,
    todayFocusAvailable,
  });

  const dismissFirstAction = useCallback(() => {
    storage.clearFirstActionPending();
    setFirstActionVisible(false);
  }, [storage]);

  const dismissSoftAuth = useCallback(() => {
    setSoftAuthDismissed(true);
  }, []);

  return {
    hero: resolution.hero,
    reason: resolution.reason,
    candidates: resolution.candidates,
    showFirstAction: resolution.hero === "first-action",
    showSoftAuth: resolution.hero === "soft-auth",
    showTodayFocus: resolution.hero === "today-focus",
    showReengagement: resolution.hero === "reengagement",
    dismissFirstAction,
    dismissSoftAuth,
  };
}
