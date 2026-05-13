import type { RefObject } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { BrandLogo } from "../app/BrandLogo";
import { OnboardingProgress } from "./OnboardingProgress";
import { ALL_MODULES } from "./vibePicks";
import { MODULE_CARDS, ModuleRow } from "./ModuleRow";
import type { OnboardingHeroCopy } from "@sergeant/shared";

// ---------------------------------------------------------------------------
// One-screen welcome
// ---------------------------------------------------------------------------

/**
 * One-screen FTUX content. Hero copy + 4 module rows (all checked by
 * default) + primary CTA + tertiary toggle to expand the rows with
 * description / teaser copy. Replaces the previous 4-step wizard
 * (welcome → modules → goals → permissions).
 *
 * Goals moved to per-module first-run sheets — the relevant question
 * shows the first time the user opens that module, not upfront.
 *
 * Permissions moved to just-in-time prompts — push is asked when the
 * user taps a "remind me" affordance inside a module (already wired in
 * `useRoutineReminders` and `usePushNotifications`), camera/mic when
 * the relevant feature is invoked.
 */
export function WelcomeOneScreen({
  picks,
  togglePick,
  onOpen,
  expanded,
  onToggleExpanded,
  copy,
  ctaLabelOverride,
  ctaDisabled,
  emptyPicksHint,
  onSecondaryAction,
  headingRef,
  ctaBusy,
}: {
  picks: string[];
  togglePick: (id: string) => void;
  onOpen: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Resolved A/B copy for the splash hero (S1.1 + S1.2). */
  copy: OnboardingHeroCopy;
  /**
   * Override label for the primary CTA. Used by tour replay to swap
   * `copy.primaryCta` for "Закрити". Real wizard always renders
   * `copy.primaryCta` so the experiment arm controls the text.
   */
  ctaLabelOverride?: string;
  /**
   * S6.1: disable the primary CTA when the user is in the `none` arm
   * of `onboarding_default_picks_v1` and has no module selected.
   */
  ctaDisabled?: boolean;
  /**
   * S6.1: inline hint rendered below the CTA when {@link ctaDisabled}
   * is true. Tells the user why the button is inactive.
   */
  emptyPicksHint?: string;
  /**
   * PR-05 — demo mode as first-class CTA. Optional handler for the
   * secondary "Подивитись приклад" button rendered inside the splash
   * card under the primary CTA. When omitted (modal mode, tour
   * replay) the secondary CTA is not rendered. Hosts (`/welcome`)
   * pass `seedDemoData()` so the demo entry sits in the same visual
   * card as the primary onboarding CTA, satisfying the share-of-
   * traffic ≥ 15% target without forcing the user to scan past the
   * card.
   */
  onSecondaryAction?: () => void;
  /**
   * Ref to the splash heading. Set by the wizard so the modal variant
   * can move focus there on mount (WCAG 2.4.3 — focus must land
   * inside the dialog so screen readers announce the new context
   * instead of stranding the user on `<body>`).
   */
  headingRef?: RefObject<HTMLHeadingElement>;
  /**
   * Disable + mark the primary CTA busy while `finish()` is mid-flight.
   * Synchronous today, but the flag keeps a double-click during the
   * same React commit (route navigation, analytics flush) from
   * firing the side-effects twice.
   */
  ctaBusy?: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center space-y-5">
      <div className="space-y-2">
        <BrandLogo size="md" variant="inline" className="mx-auto" />
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-style-hero text-text outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 rounded-sm"
        >
          {copy.title}
        </h2>
        <p className="text-sm text-muted leading-relaxed max-w-xs mx-auto">
          {copy.subtitle}
        </p>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="flex items-center gap-1">
          <Icon name="lock" size={14} aria-hidden />
          {copy.badges[0]}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="cloud-off" size={14} aria-hidden />
          {copy.badges[1]}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="eye-off" size={14} aria-hidden />
          {copy.badges[2]}
        </span>
      </div>

      <div className="w-full space-y-2">
        {MODULE_CARDS.map((card, idx) => (
          <div
            key={card.id}
            className="motion-safe:animate-module-card"
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            <ModuleRow
              card={card}
              active={picks.includes(card.id)}
              expanded={expanded}
              onToggle={() => togglePick(card.id)}
            />
          </div>
        ))}
      </div>

      <div className="w-full">
        <OnboardingProgress
          activeModules={picks}
          totalModules={ALL_MODULES.length}
        />
      </div>

      <Button
        type="button"
        onClick={onOpen}
        variant="primary"
        size="lg"
        className="w-full"
        disabled={ctaDisabled || ctaBusy}
        loading={ctaBusy}
      >
        {ctaLabelOverride ?? copy.primaryCta}
        <Icon name="chevron-right" size={16} />
      </Button>

      {ctaDisabled && emptyPicksHint ? (
        <p
          className="text-xs text-muted -mt-2"
          role="status"
          aria-live="polite"
        >
          {emptyPicksHint}
        </p>
      ) : null}

      {onSecondaryAction ? (
        <button
          type="button"
          onClick={onSecondaryAction}
          className={cn(
            "w-full flex items-center justify-center gap-2",
            "h-11 min-h-[44px] rounded-2xl border border-brand-500/35 bg-brand-500/5",
            "text-style-label text-brand-strong dark:text-brand",
            "hover:bg-brand-500/10 hover:border-brand-500/55 transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
          )}
        >
          <Icon name="sparkles" size={16} strokeWidth={2} aria-hidden />
          <span>{copy.secondaryCta}</span>
        </button>
      ) : null}

      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        className="w-full text-xs text-muted hover:text-text transition-colors py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 rounded inline-flex items-center justify-center gap-1.5"
      >
        <Icon
          name={expanded ? "chevron-up" : "chevron-down"}
          size={12}
          aria-hidden
        />
        {expanded ? "Згорнути" : "Що це за розділи?"}
      </button>
    </div>
  );
}
