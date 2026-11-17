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
 *   • TodayFocus availability is a caller-supplied boolean — the
 *     dashboard already owns `useDashboardFocus()` and we don't want
 *     to re-couple to it here.
 *
 * Soft-auth hero на вебі знято (рішення власника 2026-11-17): поза FTUX
 * кожен анонім бачить `LocalOnlyDataBanner`, який і глушив картку, тож її
 * текст переїхав у банер. Спільний резолвер кандидата `soft-auth` ще має
 * (його читає мобайл), веб передає `softAuthEligible: false`.
 */

import { useCallback, useEffect, useState } from "react";

import {
  resolveOnboardingHero,
  type OnboardingHeroId,
  type OnboardingHeroReason,
} from "@sergeant/shared";

import { clearFirstActionPending, isFirstActionPending } from "./vibePicks";

export interface UseOnboardingStateOptions {
  /** `detectFirstRealEntry()` resolved to `true`. The FTUX hero stands
   *  down once the first real entry exists. */
  hasRealEntry: boolean;
  /** `useDashboardFocus()` returned a non-null `focus` rec. The
   *  dashboard already computes this — passing it in keeps the hook
   *  decoupled from the focus implementation. */
  todayFocusAvailable: boolean;
  /** `nudges.ts:shouldShowReengagement(...)` resolved to `true`. */
  reengagementEligible: boolean;
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
  /** True when the TodayFocus card is the slot winner (default). */
  showTodayFocus: boolean;
  /** True when the re-engagement card is the slot winner — note this
   *  card replaces the entire hero block on web, so the dashboard
   *  branches on this flag at a higher level. */
  showReengagement: boolean;
  /** Dismiss the FTUX hero. Clears `hub_first_action_pending_v1`
   *  (storage) and flips the in-render flag so the next-priority
   *  candidate (today-focus) takes the slot in the same render. */
  dismissFirstAction: () => void;
}

/**
 * Pluggable storage hooks for tests. `useOnboardingState` always
 * defaults to the production `vibePicks.ts` helpers; tests inject
 * deterministic mocks via the second argument.
 */
export interface OnboardingStateStorage {
  isFirstActionPending: () => boolean;
  clearFirstActionPending: () => void;
}

const DEFAULT_STORAGE: OnboardingStateStorage = {
  isFirstActionPending,
  clearFirstActionPending,
};

export function useOnboardingState(
  options: UseOnboardingStateOptions,
  storage: OnboardingStateStorage = DEFAULT_STORAGE,
): UseOnboardingStateResult {
  const { hasRealEntry, todayFocusAvailable, reengagementEligible } = options;

  // Lazy initialisers: storage reads run once on mount, not on every
  // render. The booleans flip only via the explicit `dismiss*`
  // callbacks below.
  const [firstActionVisible, setFirstActionVisible] = useState(() =>
    storage.isFirstActionPending(),
  );
  const effectiveFirstActionVisible = firstActionVisible && !hasRealEntry;

  useEffect(() => {
    if (!hasRealEntry || !firstActionVisible) return;
    storage.clearFirstActionPending();
  }, [firstActionVisible, hasRealEntry, storage]);

  const resolution = resolveOnboardingHero({
    reengagementEligible,
    firstActionVisible: effectiveFirstActionVisible,
    softAuthEligible: false,
    todayFocusAvailable,
  });

  const dismissFirstAction = useCallback(() => {
    storage.clearFirstActionPending();
    setFirstActionVisible(false);
  }, [storage]);

  return {
    hero: resolution.hero,
    reason: resolution.reason,
    candidates: resolution.candidates,
    showFirstAction: resolution.hero === "first-action",
    showTodayFocus: resolution.hero === "today-focus",
    showReengagement: resolution.hero === "reengagement",
    dismissFirstAction,
  };
}
