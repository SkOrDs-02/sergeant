/**
 * Phase 7 D4 — WelcomeScreen preset picker.
 *
 * Replaces the row-based onboarding wizard as the cold-start surface
 * on `/welcome`: the user picks 1-4 modules from a 2x2 (mobile) / 4-col
 * (tablet+) grid before landing on the Hub. The picker IS the tour —
 * see `docs/design/design/redesign-v2/phase-7-product-decisions-2026-05-22.md`
 * D4 for the locked product call.
 *
 * Storage contract: this component is presentational. The host
 * (`WelcomeScreen`) owns persistence (vibePicks, onboarding-done flag,
 * analytics, navigation). Picker just bubbles the final selection up
 * via `onComplete(picks)`.
 *
 * Visual contract:
 *   - H.1: neutral text rows; a 22px check shows the picked state.
 *   - Tap target ≥44px (Hard Rule #11). Card body itself is the button.
 *   - Рух на hover/press знято мовою H; вибір показується станом.
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
import type { DashboardModuleId } from "@sergeant/shared";
import { MODULE_LABELS } from "@shared/lib/modules/moduleLabels";
import { messages } from "@shared/i18n/uk";

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
        <p className="text-style-body text-muted leading-relaxed max-w-xs mx-auto">
          {copy.subtitle}
        </p>
      </div>

      <div
        role="group"
        aria-label={copy.gridAriaLabel}
        className="w-full divide-y divide-line"
      >
        {ALL_MODULES.map((id) => {
          const active = picks.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => togglePick(id)}
              aria-pressed={active}
              aria-label={MODULE_LABELS[id]}
              className={cn(
                "relative w-full min-h-11 py-3 text-left pr-9",
                "transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
                active ? "text-text" : "text-muted",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute top-3 right-0 w-[22px] h-[22px] rounded-check border border-control",
                  "flex items-center justify-center",
                  "transition-opacity",
                  active
                    ? "bg-ink text-bg border-ink"
                    : "bg-bg text-transparent",
                )}
              >
                <Icon name="check" size="xs" strokeWidth={3} />
              </span>
              <span className="block text-style-label text-text">
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
        variant="solid"
        size="lg"
        className="w-full"
        disabled={ctaDisabled}
      >
        {copy.cta}
      </Button>

      <p
        className="text-style-caption text-muted -mt-2"
        role={ctaDisabled ? "status" : undefined}
        aria-live={ctaDisabled ? "polite" : undefined}
      >
        {ctaDisabled ? copy.emptyHint : copy.lateHint}
      </p>

      {/* До 2026-09-16 це був ручний `<button>` із власною фокус-рамкою і
          власним 44px-підлогою — борг дизайн-контракту онбордингу. Канон
          примітива дає і те, і те; лишились тільки візуальні оверрайди
          (суцільна панель: напівпрозора `bg-panel/60` прибрана 2026-10-01,
          A8.3 аудиту контрасту), а `h-11 min-h-[44px]`
          тримає ту саму висоту й на fine-pointer, де `Button` підлогу
          навмисно не застосовує. */}
      <Button
        type="button"
        onClick={onOpenAuth}
        variant="outline"
        size="md"
        className="w-full h-11 min-h-[44px] rounded-lg border-line bg-panel text-style-label text-text hover:bg-panelHi hover:border-brand-500/40"
      >
        <span>{copy.haveAccount}</span>
      </Button>
    </div>
  );
}
