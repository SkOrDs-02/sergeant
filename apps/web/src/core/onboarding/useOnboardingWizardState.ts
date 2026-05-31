import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { webKVStore } from "@shared/lib/storage/storage";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import {
  ALL_MODULES,
  markFirstActionPending,
  markFirstActionStartedAt,
  saveVibePicks,
} from "./vibePicks";
import {
  isOnboardingCompletedFired,
  markOnboardingCompletedFired,
  markOnboardingDone,
} from "./onboardingGate";
import {
  ONBOARDING_DEFAULT_PICKS_EXPERIMENT,
  ONBOARDING_GOAL_FIRST_EXPERIMENT,
  ONBOARDING_HERO_COPY_EXPERIMENT,
  assignVariant,
  getOnboardingHeroCopy,
  getOutcomeById,
  type DashboardModuleId,
  type OnboardingDefaultPicksVariant,
  type OnboardingGoalFirstVariant,
  type OnboardingHeroCopy,
  type OnboardingHeroCopyVariant,
  type OnboardingOutcomeId,
} from "@sergeant/shared";
import {
  clearPersistedPicks,
  loadPersistedPicks,
  persistPicks,
} from "./picksStorage";

export interface UseOnboardingWizardStateArgs {
  /**
   * "real" (default) — first-run wizard: persists picks, fires the FTUX
   * funnel events, and marks onboarding done on finish.
   *
   * "tour" — read-only replay launched from Settings → "Подивитись tour".
   * Skips all storage writes and FTUX-funnel events, fires
   * `onboarding_replay_*` instead, and `finish` simply closes the
   * wizard without touching the user's onboarding / first-action state.
   */
  mode: "real" | "tour";
  onDone: (
    startModuleId: string | null,
    opts?: { intent: string; picks: string[] },
  ) => void;
  /**
   * PR-05 — demo mode as first-class CTA. Optional handler for the
   * "Подивитись приклад" button rendered inside the splash card. Only
   * passed by the `/welcome` host (`fullPage` variant); modal mode and
   * tour replay leave the secondary CTA hidden so demo seeding never
   * happens by accident from in-app surfaces.
   */
  onSecondaryAction?: () => void;
}

export interface UseOnboardingWizardStateReturn {
  picks: string[];
  togglePick: (id: string) => void;
  expanded: boolean;
  toggleExpanded: () => void;
  heroCopy: OnboardingHeroCopy;
  ctaDisabled: boolean;
  ctaLabelOverride?: string;
  emptyPicksHint: string;
  finish: () => void;
  /**
   * `true` between the first successful `finish()` call and unmount.
   * Used by the CTA to render a busy state and by the hook itself to
   * block re-entrant submissions (analytics / storage writes are not
   * idempotent — see {@link finish}).
   */
  submitting: boolean;
  secondaryAction?: () => void;
  /**
   * Resolved PR-13 goal-first A/B variant. `control` keeps the legacy
   * module-checklist welcome; `goal_first` swaps in `GoalFirstScreen`
   * (single-outcome commit → derived module). Tour replay always
   * resolves to `control` so the marketing screenshot stays stable.
   */
  goalFirstVariant: OnboardingGoalFirstVariant;
  /**
   * Goal-first arm handler. Persists the derived module as the only
   * pick, fires the FTUX completion / vibe-picked events with the
   * outcome-first intent payload, marks onboarding done and routes
   * to the hub — symmetric to {@link finish} but with the single
   * outcome-derived pick already known.
   */
  pickGoal: (outcomeId: OnboardingOutcomeId) => void;
  /**
   * Tertiary escape hatch from the goal-first arm. Switches the
   * wizard back to the module-checklist welcome without exiting the
   * experiment cohort (`goal_first_skipped` is still reported via
   * `ONBOARDING_GOAL_FIRST_PICKED` with `outcome="skip"` so PostHog
   * can split converted vs. skipped exposures).
   */
  skipGoalFirst: () => void;
  /**
   * `true` after the user falls back from the goal-first arm to the
   * legacy module welcome via {@link skipGoalFirst}. Drives the
   * wizard's switch between `GoalFirstScreen` and `WelcomeOneScreen`
   * without losing the experiment exposure.
   */
  goalFirstSkipped: boolean;
}

/**
 * State-machine hook for `OnboardingWizard`. Owns:
 *  - persisted module picks + expand/collapse state for the splash;
 *  - A/B variant resolution (hero copy + opt-in `default-picks`);
 *  - FTUX analytics (started → step viewed → vibe picked → step
 *    completed → completed) and the tour-replay variant of those;
 *  - `finish()` handler that decides whether to persist + mark
 *    onboarding done or stay on the splash (S6.1 disabled-CTA branch).
 *
 * Keeps the composition root (`OnboardingWizard.tsx`) free of every
 * non-presentational concern.
 */
// AI-CONTEXT: variant assignment for the FTUX wizard. `mode` ("tour" vs
// real-wizard) and the default-picks arm (always "none" since 2026-05-08)
// are read once and pinned for the entire mount. Flipping arms mid-flight
// would reshuffle module picks under the user's pointer — never make this
// reactive without a hard reset of the wizard state.
export function useOnboardingWizardState({
  mode,
  onDone,
  onSecondaryAction,
}: UseOnboardingWizardStateArgs): UseOnboardingWizardStateReturn {
  const isTour = mode === "tour";

  // Default-picks A/B (S6.1). Assignment is deterministic per device
  // fingerprint and persists across renders, so the user always sees
  // the same arm — no mid-flight flip from "all pre-selected" to
  // "empty" between paints. Tour replay short-circuits to the legacy
  // `all` arm so the read-only replay always shows every module
  // pre-checked, matching the screenshot we ship in marketing.
  // UX-feedback 2026-05-08: kill the A/B test and force `none` for every
  // real wizard mount. Users were confused by the pre-selected modules
  // ("we planned that on start everything would be off and the user
  // picks themselves, right?") — pre-checking everything was reading as
  // "we already chose for you" rather than as a friendly default. Tour
  // replay still pins to `all` so the marketing screenshot stays
  // consistent.
  const defaultPicksVariant = useMemo<OnboardingDefaultPicksVariant>(() => {
    if (isTour) return "all";
    // Touch the experiment for analytics continuity, but ignore the
    // result. Variant is hardcoded to `none` until / unless we run a
    // new experiment that explicitly opts into pre-selection.
    assignVariant(webKVStore, ONBOARDING_DEFAULT_PICKS_EXPERIMENT);
    return "none";
  }, [isTour]);

  // PR-13 / S5.1 goal-first A/B. Assignment is deterministic per
  // device fingerprint so a returning user always re-enters the same
  // arm (S5.1 D7 retention measurement is meaningless if the cohort
  // flips between sessions). Tour replay pins to `control` so the
  // read-only replay never appears to advertise an experiment the
  // user is not actually enrolled in.
  const goalFirstVariant = useMemo<OnboardingGoalFirstVariant>(() => {
    if (isTour) return "control";
    return assignVariant(
      webKVStore,
      ONBOARDING_GOAL_FIRST_EXPERIMENT,
    ) as OnboardingGoalFirstVariant;
  }, [isTour]);

  const [picks, setPicks] = useState<string[]>(() =>
    isTour ? [...ALL_MODULES] : loadPersistedPicks(defaultPicksVariant),
  );
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [goalFirstSkipped, setGoalFirstSkipped] = useState(false);

  // Double-submit guard. `finish()` is synchronous today, but a
  // double-tap on the primary CTA during the same React commit (e.g.
  // route navigation kicks in between paint and unmount) would
  // otherwise fire the analytics events / `saveVibePicks` /
  // `markOnboardingDone` writes twice. Ref-based so it stays in
  // sync inside the same tick — a `useState` flag alone would not
  // block the second click before the next render flush.
  const submittingRef = useRef(false);

  // Persist picks on every change. Payload is tiny (≤4 strings) so
  // unconditional writes are cheap and keep the resume-after-refresh
  // story trivial. Tour mode is throwaway state — never persists.
  useEffect(() => {
    if (isTour) return;
    persistPicks(picks);
  }, [picks, isTour]);

  // Real wizard: first paint counts as both `onboarding_started` and the
  // welcome step's `onboarding_step_viewed` so the funnel definition in
  // `posthog-ftux-dashboards.md` stays a strict superset of `started`.
  // Tour replay fires its own events instead so it never inflates the
  // FTUX funnel.
  const startedAtRef = useRef<number | null>(null);
  useEffect(() => {
    startedAtRef.current = Date.now();
    if (isTour) {
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_REPLAY_VIEWED);
      return;
    }
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STARTED);
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, { step: "welcome" });
  }, [isTour]);

  const togglePick = useCallback((id: string) => {
    setPicks((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }, []);

  const toggleExpanded = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  const finish = useCallback(() => {
    // Block re-entrant clicks: the side-effects below (analytics,
    // storage writes, route navigation via `onDone`) are not
    // idempotent. A second click during the same commit must be a
    // no-op. The flag is never reset because the wizard unmounts
    // immediately after the first successful call.
    if (submittingRef.current) return;

    if (isTour) {
      submittingRef.current = true;
      setSubmitting(true);
      // Tour replay: no side effects on user state. Just emit the
      // dismissal event with a duration so PostHog can show "how long
      // does the user spend in replay" without polluting the FTUX
      // funnel.
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_REPLAY_DISMISSED, {
        durationMs: Math.max(
          0,
          Date.now() - (startedAtRef.current ?? Date.now()),
        ),
      });
      onDone(null, { intent: "tour_replay", picks: [] });
      return;
    }

    const hadEmptyPicks = picks.length === 0;

    // S6.1 / B-1: in the `none` arm we never silently fall back to
    // ALL_MODULES — the primary CTA is disabled while picks is empty,
    // so reaching this branch means the wizard component bypassed the
    // disable (keyboard-driven submit, programmatic call, etc.). Bail
    // out without writing any state so the user's choice (none yet)
    // is preserved and they stay on the splash.
    if (hadEmptyPicks && defaultPicksVariant === "none") {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    // `all` arm (legacy): empty selection falls back to all modules
    // so the lazy "tap-through" path leaves every module visible on
    // the hub instead of producing a useless dashboard.
    const chosen = hadEmptyPicks ? [...ALL_MODULES] : picks;
    saveVibePicks(chosen as never[]);

    trackEvent(ANALYTICS_EVENTS.ONBOARDING_VIBE_PICKED, {
      picks: chosen,
      picksCount: chosen.length,
    });
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, {
      step: "welcome",
      durationMs: Math.max(
        0,
        Date.now() - (startedAtRef.current ?? Date.now()),
      ),
    });
    // PR-07 — `onboarding_completed` is the once-per-account funnel
    // milestone (WF-60: `signup_completed → onboarding_completed →
    // first_action_completed`). Repeat invocations of `finish()`
    // (programmatic re-call, double-tap on the CTA while the modal
    // is still mounted) must not re-emit the event, otherwise the
    // PostHog funnel reads an inflated activation count for the same
    // user. The `vibe_picked` / `step_completed` events above stay
    // per-submission — they describe the picks payload of the
    // current attempt, not the activation milestone.
    if (!isOnboardingCompletedFired()) {
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
        intent: hadEmptyPicks ? "vibe_empty" : "vibe_picked",
        picksCount: chosen.length,
      });
      markOnboardingCompletedFired();
    }

    markFirstActionStartedAt();
    markFirstActionPending();
    markOnboardingDone();
    clearPersistedPicks();

    // Wizard finish is a clean handoff to the hub — no celebration modal
    // here. The real CelebrationModal fires on the user's first real entry
    // (see `useFirstEntryCelebration`), so onboarding-completion stays a
    // promise ("тут буде твій дашборд") instead of a fake reward.
    onDone(null, {
      intent: hadEmptyPicks ? "vibe_empty" : "vibe_picked",
      picks: chosen,
    });
  }, [picks, onDone, isTour, defaultPicksVariant]);

  // Goal-first arm completion (PR-13). Symmetric to {@link finish}
  // but driven by a single outcome → module mapping instead of the
  // module-checklist. Shares the same re-entry guard + once-per-
  // account `onboarding_completed` semantics so the funnel never
  // double-counts a user that bounced between arms via Settings
  // reset. Tour replay refuses the call so the read-only replay
  // cannot accidentally persist a goal pick against the host store.
  const pickGoal = useCallback(
    (outcomeId: OnboardingOutcomeId) => {
      if (isTour) return;
      if (submittingRef.current) return;

      const outcome = getOutcomeById(outcomeId);
      if (!outcome) return;

      submittingRef.current = true;
      setSubmitting(true);

      const chosen: DashboardModuleId[] = [outcome.module];
      saveVibePicks(chosen as never[]);

      trackEvent(ANALYTICS_EVENTS.ONBOARDING_VIBE_PICKED, {
        picks: chosen,
        picksCount: chosen.length,
        intent: "goal_first",
        outcome: outcomeId,
      });
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, {
        step: "goal_first",
        durationMs: Math.max(
          0,
          Date.now() - (startedAtRef.current ?? Date.now()),
        ),
      });
      if (!isOnboardingCompletedFired()) {
        trackEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
          intent: "goal_first",
          outcome: outcomeId,
          picksCount: chosen.length,
        });
        markOnboardingCompletedFired();
      }

      markFirstActionStartedAt();
      markFirstActionPending();
      markOnboardingDone();
      clearPersistedPicks();

      onDone(outcome.module, {
        intent: "goal_first",
        picks: chosen,
      });
    },
    [isTour, onDone],
  );

  // Goal-first escape hatch. Switches the wizard back to the legacy
  // module welcome without mutating onboarding state — the user
  // stays in the same experiment cohort but reports a `skip`
  // outcome so PostHog can split conversion among exposures.
  const skipGoalFirst = useCallback(() => {
    if (isTour) return;
    if (goalFirstSkipped) return;
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_GOAL_FIRST_PICKED, {
      outcome: "skip",
      module: null,
    });
    setGoalFirstSkipped(true);
  }, [isTour, goalFirstSkipped]);

  // Hero copy A/B (S1.1 + S1.2). Assignment is deterministic per
  // device fingerprint and persists across renders, so the user always
  // sees the same headline / CTA throughout the funnel. Tour replay
  // bypasses assignment so it never gets counted as an exposure.
  const heroVariant = useMemo<OnboardingHeroCopyVariant>(
    () =>
      isTour
        ? "outcome"
        : (assignVariant(
            webKVStore,
            ONBOARDING_HERO_COPY_EXPERIMENT,
          ) as OnboardingHeroCopyVariant),
    [isTour],
  );
  const heroCopy = useMemo(
    () => getOnboardingHeroCopy(heroVariant),
    [heroVariant],
  );

  // Fire `EXPERIMENT_EXPOSED` on the same render the user actually sees
  // the variant. Real wizard only — tour replay must not contaminate
  // the experiment dataset. Effects run once because both variants are
  // stable for the lifetime of the wizard mount.
  useEffect(() => {
    if (isTour) return;
    trackEvent(ANALYTICS_EVENTS.EXPERIMENT_EXPOSED, {
      experiment_id: ONBOARDING_HERO_COPY_EXPERIMENT.id,
      variant: heroVariant,
    });
    trackEvent(ANALYTICS_EVENTS.EXPERIMENT_EXPOSED, {
      experiment_id: ONBOARDING_DEFAULT_PICKS_EXPERIMENT.id,
      variant: defaultPicksVariant,
    });
    trackEvent(ANALYTICS_EVENTS.EXPERIMENT_EXPOSED, {
      experiment_id: ONBOARDING_GOAL_FIRST_EXPERIMENT.id,
      variant: goalFirstVariant,
    });
  }, [isTour, heroVariant, defaultPicksVariant, goalFirstVariant]);

  // S6.1: only the `none` arm disables the CTA on empty picks. Tour
  // replay never disables the CTA — replay always renders all four
  // pre-checked, so the disabled state would be unreachable noise.
  const ctaDisabled =
    !isTour && defaultPicksVariant === "none" && picks.length === 0;

  // Tour replay never seeds demo data — `onSecondaryAction` is only
  // wired through in real mode so the read-only replay can never
  // accidentally trigger the demo seeder against the host's store.
  const secondaryAction = isTour ? undefined : onSecondaryAction;

  return {
    picks,
    togglePick,
    expanded,
    toggleExpanded,
    heroCopy,
    ctaDisabled,
    ctaLabelOverride: isTour ? "Закрити" : undefined,
    emptyPicksHint: "Обери хоч один розділ",
    finish,
    submitting,
    secondaryAction,
    goalFirstVariant,
    pickGoal,
    skipGoalFirst,
    goalFirstSkipped,
  };
}
