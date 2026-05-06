/**
 * Pure resolver for the FTUX hero slot's "single-hero rule" (PR-12).
 *
 * Web `HubDashboard` (and, eventually, mobile `HubDashboard`) renders a
 * single primary card at the top of the dashboard chrome. Across the
 * onboarding journey this slot is contended by four very different
 * surfaces, each with its own copy / CTA / dismissal semantics:
 *
 *   1. `ReEngagementCard`  — fired when the user has been inactive for
 *      ≥ `REENGAGEMENT_INACTIVE_DAYS` (see `nudges.ts`). Treat as the
 *      ultimate hero: a returning-user nudge wins over any FTUX/auth
 *      framing because we want the comeback acknowledged before
 *      anything else.
 *   2. `FirstActionHeroCard` — pre-first-real-entry FTUX hero. Drives
 *      the "tap once to your first real entry" flow.
 *   3. `SoftAuthPromptCard` — anonymous user, post-FTUX, eligible
 *      session-day window. Cheap account-creation nudge that should
 *      not collide with FTUX (`firstActionVisible` win).
 *   4. `TodayFocusCard`     — the default daily card; visible whenever
 *      the dashboard has a focus rec to surface and no higher-priority
 *      contender is asking for the slot.
 *
 * Before this resolver, the priority chain was an ad-hoc `if/else`
 * ladder inside `HubDashboard` that was duplicated almost verbatim on
 * mobile. Every new hero candidate forced an `if` insertion in two
 * files and a coordinated review to keep tie-breaking consistent.
 * Centralising the rule here lets the dashboards stay declarative
 * (`state.activeHero === "first-action"` vs the previous `if (foo)
 * else if (bar) else …`) and lets the `single-hero` invariant be
 * asserted once for both platforms — exactly what the FTUX master
 * tracker §3.2 / PR-12 metric expects ("≤1 prompt-card одночасно").
 */

/**
 * Identifier for a candidate hero card. Matches the React component
 * names from `apps/web/src/core/hub/HubDashboard.tsx`. New hero
 * candidates must be inserted into `ONBOARDING_HERO_PRIORITY` in the
 * order they should win the slot.
 */
export type OnboardingHeroId =
  | "reengagement"
  | "first-action"
  | "soft-auth"
  | "today-focus";

/**
 * Eligibility flags for each candidate. Callers compute these from
 * their own state (storage, useEffect-tracked flags, derived booleans)
 * and pass them through; the resolver itself stays pure so it is
 * trivial to unit-test and to re-run on every render without worrying
 * about side effects.
 */
export interface OnboardingHeroInputs {
  /** `nudges.ts:shouldShowReengagement(...)` resolved to `true`. */
  reengagementEligible: boolean;
  /** `vibePicks.ts:isFirstActionPending(...)` resolved to `true` and
   *  the user has not yet dismissed the FTUX hero in this render. */
  firstActionVisible: boolean;
  /** Composite eligibility for the soft-auth nag — anonymous user,
   *  not previously dismissed, callable `onShowAuth` available, and
   *  `sessionDays` past the configured threshold. The resolver does
   *  not crack this composite open because every input has its own
   *  tested predicate already. */
  softAuthEligible: boolean;
  /** `useDashboardFocus()` returned a non-null `focus` rec. The
   *  TodayFocus card is otherwise empty and would never be a real
   *  hero candidate, so we filter it out at the resolver level. */
  todayFocusAvailable: boolean;
}

/**
 * Why the given `hero` won. Mirrors `OnboardingHeroId` so dashboards
 * can fire one-shot analytics events when the slot flips, e.g.
 * `hub_hero_resolved` with `reason: "ftux-pending"`. Keeping the
 * vocabulary tight (one tag per hero) means PostHog can compute
 * "hero conflict rate" as `count(distinct(reason) per session) > 1`.
 */
export type OnboardingHeroReason =
  | "reengagement-active"
  | "ftux-pending"
  | "soft-auth-due"
  | "today-focus"
  | "none";

export interface OnboardingHeroResolution {
  /** Winning hero id, or `null` when no candidate is eligible — in
   *  that case the dashboard should render nothing in the hero slot
   *  (post-FTUX without a focus rec is the canonical "empty" path). */
  hero: OnboardingHeroId | null;
  /** Reason matching the winner (for analytics). `none` when
   *  `hero === null`. */
  reason: OnboardingHeroReason;
  /** All eligible candidates in priority order. Lets the dashboard
   *  assert the single-hero invariant in dev (`candidates.length <=
   *  1` after deduping) and lets tests inspect tie-break behaviour
   *  without re-running the resolver multiple times. */
  candidates: OnboardingHeroId[];
}

/**
 * Single-hero priority order. Higher-priority candidates eat lower-
 * priority ones. Re-engagement wins everything — a returning user is
 * a stronger signal than any FTUX framing. FTUX wins next so we never
 * overlay a soft-auth nag on top of an unfinished first-action flow.
 * Soft-auth then wins the remaining slot, and today-focus is the
 * default fallback when no special nudge is due.
 */
export const ONBOARDING_HERO_PRIORITY: readonly OnboardingHeroId[] = [
  "reengagement",
  "first-action",
  "soft-auth",
  "today-focus",
] as const;

const REASON_BY_HERO: Record<OnboardingHeroId, OnboardingHeroReason> = {
  reengagement: "reengagement-active",
  "first-action": "ftux-pending",
  "soft-auth": "soft-auth-due",
  "today-focus": "today-focus",
};

/**
 * Resolve the single hero for the dashboard's hero slot.
 *
 * - When zero candidates are eligible, returns `{ hero: null, reason:
 *   "none", candidates: [] }`. Callers should render nothing in the
 *   slot (or a no-op skeleton) — falling back to one of the cards
 *   anyway would re-introduce the "two heroes at once" bug we are
 *   fixing.
 * - Otherwise returns the highest-priority eligible candidate plus
 *   the full `candidates` list so callers can verify the single-hero
 *   invariant or fire conflict analytics.
 *
 * The function is intentionally pure and synchronous — no storage
 * access, no `useState`, no React imports — so it can be re-evaluated
 * on every render without a memoisation hop, and so it is trivially
 * tested via the table-driven cases in `onboardingHero.test.ts`.
 */
export function resolveOnboardingHero(
  inputs: OnboardingHeroInputs,
): OnboardingHeroResolution {
  const eligibility: Record<OnboardingHeroId, boolean> = {
    reengagement: inputs.reengagementEligible,
    "first-action": inputs.firstActionVisible,
    "soft-auth": inputs.softAuthEligible,
    "today-focus": inputs.todayFocusAvailable,
  };

  const candidates = ONBOARDING_HERO_PRIORITY.filter((id) => eligibility[id]);

  if (candidates.length === 0) {
    return { hero: null, reason: "none", candidates: [] };
  }

  const hero = candidates[0]!;
  return { hero, reason: REASON_BY_HERO[hero], candidates };
}
