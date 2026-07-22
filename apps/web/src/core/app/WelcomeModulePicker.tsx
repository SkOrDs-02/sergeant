/**
 * Phase 7 D4 — WelcomeScreen preset picker.
 *
 * Replaces the row-based onboarding wizard as the cold-start surface
 * on `/welcome`: the user picks 1-4 modules from a 2x2 (mobile) / 4-col
 * (tablet+) grid before landing on the Hub. The picker IS the tour —
 * see `docs/design/redesign-v2/phase-7-product-decisions-2026-05-22.md`
 * D4 for the locked product call.
 *
 * Storage contract: this component is presentational. The host
 * (`WelcomeScreen`) owns persistence (vibePicks, onboarding-done flag,
 * analytics, navigation). Picker just bubbles the final selection up
 * via `onComplete(picks)`.
 *
 * Visual contract:
 *   - Module cards use the existing `--c-{module}` accent token family
 *     (matches Hub bento + Settings module toggles). Picked state adds
 *     a ring + accent surface; unpicked stays neutral.
 *   - Tap target ≥44px (Hard Rule #11). Card body itself is the button.
 *   - Active-press animation = `active:scale-[0.97]` (Hard Rule #17
 *     RESPONSE class). No ambient motion — `MeshBackground` at the
 *     page level already supplies AMBIENT motion.
 *   - All four cards default to *picked* on mount. Matches the
 *     existing onboarding A/B "all" arm (post-S6.1 default) so legacy
 *     users who already saw the row-based wizard observe identical
 *     downstream behaviour.
 */

import { useCallback, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { BrandLogo } from "./BrandLogo";
import { ALL_MODULES } from "../onboarding/vibePicks";
import {
  ONBOARDING_VIBE_ICONS,
  type DashboardModuleId,
} from "@sergeant/shared";
import { MODULE_LABELS } from "@shared/lib/modules/moduleLabels";
import { messages } from "@shared/i18n/uk";

/**
 * Per-module visual tokens. Maps each module to:
 *   - `border` — outline when the card is picked.
 *   - `bg` — soft tint applied to the picked card body.
 *   - `icon` — chip background for the top-left module icon.
 *   - `ring` — focus / picked outer ring.
 *   - `check` — solid swatch behind the corner ✓ glyph.
 *
 * Classes mirror the existing `ModuleRow` palette in
 * `apps/web/src/core/onboarding/ModuleRow.tsx` so the picked-state look
 * stays coherent across onboarding surfaces.
 */
const MODULE_VISUALS: Record<
  DashboardModuleId,
  { border: string; bg: string; icon: string; ring: string; check: string }
> = {
  finyk: {
    border: "border-finyk/60",
    bg: "bg-finyk/8",
    icon: "bg-finyk/15 text-finyk",
    ring: "ring-finyk/40",
    check: "bg-finyk-strong",
  },
  fizruk: {
    border: "border-fizruk/60",
    bg: "bg-fizruk/8",
    icon: "bg-fizruk/15 text-fizruk",
    ring: "ring-fizruk/40",
    check: "bg-fizruk-strong",
  },
  routine: {
    border: "border-routine/60",
    bg: "bg-routine/8",
    icon: "bg-routine/15 text-routine",
    ring: "ring-routine/40",
    check: "bg-routine-strong",
  },
  nutrition: {
    border: "border-nutrition/60",
    bg: "bg-nutrition/8",
    icon: "bg-nutrition/15 text-nutrition",
    ring: "ring-nutrition/40",
    check: "bg-nutrition-strong",
  },
};

export interface WelcomeModulePickerProps {
  /**
   * Fired when the user taps the primary CTA. `picks` is a non-empty,
   * deduplicated, order-preserved subset of {@link ALL_MODULES}; the
   * CTA is disabled until the user has at least one pick, so callers
   * never receive `[]`.
   */
  onComplete: (picks: DashboardModuleId[]) => void;
  /** Returning-user escape hatch. Routes to the sign-in page. */
  onOpenAuth: () => void;
  /**
   * Optional demo entry — same contract as `OnboardingWizard.onSecondaryAction`.
   * When provided, renders the "Подивитись приклад" secondary CTA so
   * the demo flow is reachable from the new welcome surface.
   */
  onSecondaryAction?: () => void;
}

/**
 * Preset-first welcome surface.
 *
 * Defaults to all four modules picked so a user who taps through
 * without changing anything keeps the current "populated Hub"
 * experience. Tapping a card toggles its pick state; CTA is disabled
 * while the selection is empty, matching `useOnboardingWizardState`'s
 * `ctaDisabled` contract on the `none` A/B arm.
 */
export function WelcomeModulePicker({
  onComplete,
  onOpenAuth,
  onSecondaryAction,
}: WelcomeModulePickerProps) {
  const [picks, setPicks] = useState<readonly DashboardModuleId[]>(() => [
    ...ALL_MODULES,
  ]);

  const togglePick = useCallback((id: DashboardModuleId) => {
    setPicks((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : ALL_MODULES.filter((x) => prev.includes(x) || x === id),
    );
  }, []);

  const handleStart = useCallback(() => {
    if (picks.length === 0) return;
    onComplete([...picks]);
  }, [picks, onComplete]);

  const ctaDisabled = picks.length === 0;
  const copy = messages.welcomeModulePicker;

  return (
    <div className="flex flex-col items-center text-center space-y-5">
      <div className="space-y-2">
        <BrandLogo size="md" variant="inline" className="mx-auto" />
        <h2
          className={cn(
            "text-style-headline text-text outline-none",
            "focus-visible:ring-2 focus-visible:ring-focus/45 rounded-sm",
          )}
          tabIndex={-1}
        >
          {copy.heading}
        </h2>
        <p className="text-sm text-muted leading-relaxed max-w-xs mx-auto">
          {copy.subtitle}
        </p>
      </div>

      <div
        role="group"
        aria-label={copy.gridAriaLabel}
        className={cn("grid w-full gap-3", "grid-cols-2 sm:grid-cols-4")}
      >
        {ALL_MODULES.map((id) => {
          const v = MODULE_VISUALS[id];
          const active = picks.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => togglePick(id)}
              aria-pressed={active}
              aria-label={MODULE_LABELS[id]}
              className={cn(
                "relative min-h-[120px] sm:min-h-[140px] p-3.5 text-left",
                "rounded-2xl border bg-panel transition-all duration-200",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
                "active:scale-[0.97] motion-reduce:active:scale-100",
                active
                  ? cn(v.border, v.bg, "shadow-card ring-2", v.ring)
                  : "border-line hover:border-brand-500/30",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute top-2.5 right-2.5 w-5 h-5 rounded-full",
                  "text-white flex items-center justify-center",
                  "transition-opacity",
                  active ? cn(v.check, "opacity-100") : "opacity-0",
                )}
              >
                <Icon name="check" size={12} strokeWidth={3} />
              </span>
              <span
                aria-hidden
                className={cn(
                  "flex w-10 h-10 items-center justify-center rounded-xl",
                  active ? v.icon : "bg-panelHi text-muted",
                )}
              >
                <Icon
                  name={ONBOARDING_VIBE_ICONS[id]}
                  size={20}
                  strokeWidth={2}
                />
              </span>
              <span className="mt-2.5 block text-style-label text-text">
                {MODULE_LABELS[id]}
              </span>
              <span className="mt-1 block text-style-caption text-muted leading-snug">
                {copy.taglines[id]}
              </span>
            </button>
          );
        })}
      </div>

      <Button
        type="button"
        onClick={handleStart}
        variant="primary"
        size="lg"
        className="w-full"
        disabled={ctaDisabled}
      >
        {copy.cta}
        <Icon name="chevron-right" size={16} />
      </Button>

      <p
        className="text-xs text-muted -mt-2"
        role={ctaDisabled ? "status" : undefined}
        aria-live={ctaDisabled ? "polite" : undefined}
      >
        {ctaDisabled ? copy.emptyHint : copy.lateHint}
      </p>

      {onSecondaryAction ? (
        <button
          type="button"
          onClick={onSecondaryAction}
          className={cn(
            "w-full flex items-center justify-center gap-2",
            "h-11 min-h-[44px] rounded-2xl border border-brand-500/35 bg-brand-500/5",
            "text-style-label text-brand-strong dark:text-brand",
            "hover:bg-brand-500/10 hover:border-brand-500/55 transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
          )}
        >
          <Icon name="sparkles" size={16} strokeWidth={2} aria-hidden />
          <span>{copy.demoCta}</span>
        </button>
      ) : null}

      <button
        type="button"
        onClick={onOpenAuth}
        className={cn(
          "w-full flex items-center justify-center gap-2",
          "h-11 min-h-[44px] rounded-2xl border border-line bg-panel/60",
          "text-style-label text-text",
          "hover:bg-panelHi hover:border-brand-500/40 transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
        )}
      >
        <Icon name="user" size={16} strokeWidth={2} aria-hidden />
        <span>{copy.haveAccount}</span>
      </button>
    </div>
  );
}
