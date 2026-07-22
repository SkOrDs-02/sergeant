import { useCallback, useEffect, useRef, type RefObject } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import { BrandLogo } from "../app/BrandLogo";
import {
  ONBOARDING_OUTCOMES,
  ONBOARDING_VIBE_ICONS,
  type OnboardingOutcomeCopy,
  type OnboardingOutcomeId,
} from "@sergeant/shared";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";

// ---------------------------------------------------------------------------
// Goal-first welcome (PR-13, S5.1)
// ---------------------------------------------------------------------------

/**
 * Outcome-first variant of the first-run wizard. Replaces the
 * module-checklist welcome with a 4-outcome grid: «Що для тебе зараз
 * важливо?» → one outcome → wizard derives the primary module and
 * completes immediately. The hypothesis (master tracker §7.1 / S5.1)
 * is that a single high-level commitment ("less spending", "stay in
 * shape", …) buys ≥ 5pp of D7 retention versus the multi-checkbox
 * shopping cart, which currently reads as a feature inventory rather
 * than as a promise.
 *
 * Lives behind the `onboarding_goal_first_v1` experiment — assignment
 * is owned by `useOnboardingWizardState`; this component just renders
 * the screen and forwards `(outcomeId, moduleId)` to the host.
 *
 * Analytics:
 *   - `ONBOARDING_GOAL_FIRST_SHOWN { variant: "goal_first" }` once
 *     per mount so PostHog can confirm exposure parity with the
 *     `EXPERIMENT_EXPOSED` event already emitted by the hook.
 *   - `ONBOARDING_GOAL_FIRST_PICKED { outcome, module }` on tap.
 *     The screen is single-select, so each user contributes at most
 *     one event.
 */
export interface GoalFirstScreenProps {
  /**
   * Resolved primary handler. Called with the chosen outcome and its
   * mapped module. The host (wizard) is responsible for persisting
   * picks, marking onboarding complete, and routing to the hub —
   * `GoalFirstScreen` does not mutate any state on its own so the
   * tour-replay path can mount this component without side-effects.
   */
  onChoose: (
    outcomeId: OnboardingOutcomeId,
    moduleId: OnboardingOutcomeCopy["module"],
  ) => void;
  /**
   * Optional skip handler. When provided, renders a tertiary text
   * button («Подивитись усе») that lets the user fall back to the
   * legacy module-first wizard without committing to any single
   * outcome — the skip path keeps the funnel honest (we count
   * "no-commitment" exits separately from "no exposure").
   */
  onSkip?: () => void;
  /**
   * Disable + mark the screen busy while the host's `onChoose`
   * handler is mid-flight (route navigation, analytics flush). The
   * outcome cards turn `aria-disabled` and stop responding to taps
   * so a double-click during the same React commit can't fire the
   * downstream side-effects twice.
   */
  busy?: boolean;
  /**
   * Ref to the heading. The wizard moves initial focus here on
   * mount (WCAG 2.4.3 — focus must land inside the dialog so screen
   * readers announce the new context).
   */
  headingRef?: RefObject<HTMLHeadingElement>;
}

const OUTCOME_ACCENT: Record<
  OnboardingOutcomeCopy["module"],
  { border: string; bg: string; icon: string }
> = {
  finyk: {
    border: "border-finyk/60",
    bg: "bg-finyk/8",
    icon: "bg-finyk/15 text-finyk",
  },
  fizruk: {
    border: "border-fizruk/60",
    bg: "bg-fizruk/8",
    icon: "bg-fizruk/15 text-fizruk",
  },
  routine: {
    border: "border-routine/60",
    bg: "bg-routine/8",
    icon: "bg-routine/15 text-routine",
  },
  nutrition: {
    border: "border-nutrition/60",
    bg: "bg-nutrition/8",
    icon: "bg-nutrition/15 text-nutrition",
  },
};

export function GoalFirstScreen({
  onChoose,
  onSkip,
  busy = false,
  headingRef,
}: GoalFirstScreenProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_GOAL_FIRST_SHOWN, {
      variant: "goal_first",
    });
  }, []);

  const handlePick = useCallback(
    (outcome: OnboardingOutcomeCopy) => {
      if (busy) return;
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_GOAL_FIRST_PICKED, {
        outcome: outcome.id,
        module: outcome.module,
      });
      onChoose(outcome.id, outcome.module);
    },
    [busy, onChoose],
  );

  return (
    <div className="flex flex-col items-center text-center space-y-5">
      <div className="space-y-2">
        <BrandLogo size="md" variant="inline" className="mx-auto" />
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-style-headline text-text outline-none focus-visible:ring-2 focus-visible:ring-focus/45 rounded-sm"
        >
          {messages.onboarding.goalFirstHeading}
        </h2>
        <p className="text-sm text-muted leading-relaxed max-w-xs mx-auto">
          {messages.onboarding.goalFirstSubtitle}
        </p>
      </div>

      <ul
        className="w-full grid grid-cols-1 gap-2"
        aria-label={messages.onboarding.goalFirstAriaLabel}
      >
        {ONBOARDING_OUTCOMES.map((outcome) => {
          const accent = OUTCOME_ACCENT[outcome.module];
          const iconName = ONBOARDING_VIBE_ICONS[outcome.module];
          return (
            <li key={outcome.id}>
              <button
                type="button"
                onClick={() => handlePick(outcome)}
                aria-disabled={busy}
                className={cn(
                  "w-full text-left rounded-2xl border p-4 transition-all duration-200",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
                  busy
                    ? "border-line bg-panel opacity-60"
                    : `${accent.border} ${accent.bg} hover:shadow-sm`,
                )}
                data-testid={`goal-first-outcome-${outcome.id}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl",
                      accent.icon,
                    )}
                  >
                    <Icon name={iconName} size={20} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="text-style-label text-text">
                      {outcome.headline}
                    </div>
                    <div className="text-xs text-muted mt-1 leading-snug">
                      {outcome.body}
                    </div>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {onSkip ? (
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="text-muted"
          data-testid="goal-first-skip"
        >
          {messages.onboarding.goalFirstSkipLabel}
        </Button>
      ) : null}
    </div>
  );
}
