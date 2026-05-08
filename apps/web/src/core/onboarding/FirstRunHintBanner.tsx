import { cn } from "@shared/lib/ui/cn";

/**
 * One-time hint shown in-place at each module's canonical goal-setting
 * surface (nutrition Menu / finyk Budgets / routine quick-create).
 * Replaces the retired `<ModuleFirstRunGoalSheet />` which asked goals
 * in a separate sheet that did not write to the module's own store —
 * see `useModuleFirstRun.ts` for the full rationale.
 *
 * The copy is deliberately framed as "це попередня ціль — далі сам
 * поправиш": the user sets an initial value at the same time as
 * learning where it lives, then continues to edit it from the same
 * surface as any returning user.
 *
 * Variant follows the host module's accent so the banner reads as
 * part of the page rather than a global app chrome strip.
 */

export type FirstRunHintBannerVariant = "nutrition" | "finyk" | "routine";

export interface FirstRunHintBannerProps {
  variant: FirstRunHintBannerVariant;
  /** Short headline above the description. */
  title: string;
  /** One-line copy explaining the canonical home. */
  description: string;
  /** Dismiss CTA copy. Defaults to "Зрозуміло". */
  ctaLabel?: string;
  onDismiss: () => void;
  className?: string;
}

const VARIANT_CLASSES: Record<
  FirstRunHintBannerVariant,
  { wrap: string; pill: string; cta: string }
> = {
  nutrition: {
    wrap: "border-nutrition/30 bg-nutrition/10",
    pill: "bg-nutrition-strong text-white dark:text-bg",
    cta: "border-nutrition/40 text-nutrition-strong hover:bg-nutrition/15 dark:text-nutrition",
  },
  finyk: {
    wrap: "border-success/30 bg-success/10",
    pill: "bg-success-strong text-white dark:text-bg",
    cta: "border-success/40 text-success-strong hover:bg-success/15 dark:text-success",
  },
  routine: {
    wrap: "border-routine/30 bg-routine/10",
    pill: "bg-routine-strong text-white dark:text-bg",
    cta: "border-routine/40 text-routine-strong hover:bg-routine/15 dark:text-routine",
  },
};

export function FirstRunHintBanner({
  variant,
  title,
  description,
  ctaLabel = "Зрозуміло",
  onDismiss,
  className,
}: FirstRunHintBannerProps) {
  const v = VARIANT_CLASSES[variant];
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="first-run-hint-banner"
      data-variant={variant}
      className={cn(
        "rounded-2xl border px-3.5 py-3 flex items-start gap-3",
        v.wrap,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "shrink-0 inline-flex items-center justify-center",
          "w-7 h-7 rounded-full text-sm font-bold",
          v.pill,
        )}
      >
        i
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-style-label text-text leading-snug">{title}</p>
        <p className="text-xs text-subtle leading-snug">{description}</p>
        <div className="pt-1.5">
          <button
            type="button"
            onClick={onDismiss}
            className={cn(
              "inline-flex items-center gap-1 rounded-xl border px-2.5 py-1",
              "text-xs font-semibold transition-colors",
              v.cta,
            )}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
