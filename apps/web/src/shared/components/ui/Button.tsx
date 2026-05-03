import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System — Button Component
 *
 * Variants:
 * - primary: Main CTA, emerald brand color
 * - secondary: Secondary actions, outlined
 * - ghost: Minimal, text-only actions
 * - danger: Soft destructive affordance (red-tinted, for inline "Delete" chips)
 * - destructive: Solid destructive CTA (use for confirmation dialogs / primary delete buttons)
 * - success: Confirmation actions
 *
 * Module-specific variants:
 * - finyk: Emerald finance theme
 * - fizruk: Teal fitness theme
 * - routine: Coral habit theme
 * - nutrition: Lime nutrition theme
 *
 * Touch: `xs` / `sm` / icon-only sizes get `min 44×44px` under `@media (pointer: coarse)`
 * so primary controls stay tappable on phones while staying visually compact on desktop.
 */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "destructive"
  | "success"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition"
  | "finyk-soft"
  | "fizruk-soft"
  | "routine-soft"
  | "nutrition-soft";

export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";

const variants: Record<ButtonVariant, string> = {
  // Core variants
  primary:
    "bg-brand-strong text-white shadow-sm hover:bg-brand-800 hover:shadow-glow active:bg-brand-900 active:scale-[0.98]",
  secondary:
    "bg-panel text-text border border-line shadow-sm hover:bg-panelHi hover:border-brand-200 active:scale-[0.98]",
  ghost:
    "bg-transparent text-muted hover:bg-panelHi hover:text-text active:bg-line/50",
  danger:
    "bg-danger-soft text-danger-strong border border-danger/30 hover:bg-danger/15 hover:border-danger/50 dark:text-red-200 active:scale-[0.98]",
  destructive:
    "bg-danger-strong text-white shadow-sm hover:brightness-110 hover:shadow-[0_0_0_3px_rgba(239,68,68,0.15)] active:scale-[0.98]",
  success:
    "bg-brand-soft text-brand-strong border border-brand-soft-border/50 hover:bg-brand-soft-hover dark:text-brand-300 active:scale-[0.98]",

  // Module-specific branded buttons
  finyk:
    "bg-finyk-strong text-white shadow-sm hover:bg-emerald-800 hover:shadow-glow active:bg-emerald-900 active:scale-[0.98]",
  fizruk:
    "bg-fizruk-strong text-white shadow-sm hover:bg-teal-800 hover:shadow-glow-teal active:bg-teal-900 active:scale-[0.98]",
  routine:
    "bg-routine-strong text-white shadow-sm hover:bg-coral-800 hover:shadow-glow-coral active:bg-coral-900 active:scale-[0.98]",
  nutrition:
    "bg-nutrition-strong text-white shadow-sm hover:bg-lime-900 hover:shadow-glow-lime active:scale-[0.98]",

  // Soft module variants (for secondary actions within modules).
  // Dark mode swaps the light pastel surface for the saturated accent at
  // low opacity so the button blends with the warm dark panel instead of
  // reading as an acidic pastel — same convention used by Badge/Tabs.
  "finyk-soft":
    "bg-finyk-soft text-finyk-strong dark:bg-finyk/15 dark:text-finyk border border-finyk-ring/50 dark:border-finyk/30 hover:bg-brand-100 dark:hover:bg-finyk/25 active:scale-[0.98]",
  "fizruk-soft":
    "bg-fizruk-soft text-fizruk-strong dark:bg-fizruk/15 dark:text-fizruk border border-fizruk-ring/50 dark:border-fizruk/30 hover:bg-teal-100 dark:hover:bg-fizruk/25 active:scale-[0.98]",
  "routine-soft":
    "bg-routine-surface text-routine-strong dark:bg-routine/15 dark:text-routine border border-routine-ring/50 dark:border-routine/30 hover:bg-coral-100 dark:hover:bg-routine/25 active:scale-[0.98]",
  "nutrition-soft":
    "bg-nutrition-soft text-nutrition-strong dark:bg-nutrition/15 dark:text-nutrition border border-nutrition-ring/50 dark:border-nutrition/30 hover:bg-lime-100 dark:hover:bg-nutrition/25 active:scale-[0.98]",
};

// RADIUS — every Button size lives in the CONTROL tier (12 px, rounded-xl)
// per the 3-tier system documented in `tailwind-preset.js`. The previous
// scale climbed through CARD (md/lg → 16 px) and HERO (xl → 24 px), which
// made tall CTAs read as panels rather than controls and broke the
// "all buttons are CONTROL" mental model. The xl button — at h-14 the
// only one that actually feels card-sized — bumps to CARD radius (16 px)
// so it does not compress to a near-pill on a 56 px square (icon-only xl).
const sizes: Record<ButtonSize, string> = {
  xs: "h-8 px-3 text-xs font-medium rounded-xl gap-1.5",
  sm: "h-9 px-3.5 text-sm font-medium rounded-xl gap-1.5",
  md: "h-11 px-5 text-sm font-semibold rounded-xl gap-2",
  lg: "h-12 px-6 text-base font-semibold rounded-xl gap-2",
  xl: "h-14 px-8 text-base font-bold rounded-2xl gap-2.5",
};

// Icon-only button sizes
const iconSizes: Record<ButtonSize, string> = {
  xs: "h-8 w-8 rounded-xl",
  sm: "h-9 w-9 rounded-xl",
  md: "h-11 w-11 rounded-xl",
  lg: "h-12 w-12 rounded-xl",
  xl: "h-14 w-14 rounded-2xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  loading?: boolean;
  /** Progress value 0-100 for determinate loading state */
  progress?: number;
  /**
   * When set, redirects the *neutral* `primary` / `secondary` variants to
   * the host module's branded equivalent (e.g. `module="finyk"` +
   * `variant="primary"` → renders the `finyk` solid variant; `+
   * variant="secondary"` → renders the `finyk-soft` variant).
   *
   * Other variants (`ghost`, `danger`, `destructive`, `success`, the
   * already-branded module variants) are passed through unchanged — a
   * destructive Delete button stays red even inside a Fizruk screen.
   *
   * Use this when a CTA lives inside a single module's screen and should
   * inherit that module's accent without forcing every call-site to
   * pick the right variant string. Hub-level chrome (HubHeader,
   * HubChat, dashboard) should leave `module` unset — it's intentionally
   * brand-emerald so the four modules share a neutral parent.
   */
  module?: ModuleAccent;
  children?: ReactNode;
}

const MODULE_VARIANT_OVERRIDE: Record<
  ModuleAccent,
  Partial<Record<ButtonVariant, ButtonVariant>>
> = {
  finyk: { primary: "finyk", secondary: "finyk-soft" },
  fizruk: { primary: "fizruk", secondary: "fizruk-soft" },
  routine: { primary: "routine", secondary: "routine-soft" },
  nutrition: { primary: "nutrition", secondary: "nutrition-soft" },
};

function resolveVariant(
  variant: ButtonVariant,
  module: ModuleAccent | undefined,
): ButtonVariant {
  if (!module) return variant;
  return MODULE_VARIANT_OVERRIDE[module][variant] ?? variant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      size = "md",
      type = "button",
      iconOnly = false,
      loading = false,
      progress,
      module,
      disabled,
      children,
      ...props
    },
    ref,
  ) {
    const isDisabled = disabled || loading;
    const hasProgress = typeof progress === "number" && progress >= 0;
    const needsCoarseMinTarget = iconOnly || size === "xs" || size === "sm";
    const resolvedVariant = resolveVariant(variant, module);

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        aria-live={loading ? "polite" : undefined}
        className={cn(
          // Base styles
          "inline-flex items-center justify-center touch-manipulation",
          "motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-smooth",
          "motion-reduce:transition-none motion-reduce:active:scale-100!",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
          // Touch / coarse pointer: WCAG 2.5.5 / HIG ≥44×44px for compact controls.
          needsCoarseMinTarget &&
            "pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]",
          // Variant (potentially redirected by `module` prop — see
          // resolveVariant for the mapping table).
          variants[resolvedVariant],
          // Size
          iconOnly ? iconSizes[size] : sizes[size],
          className,
        )}
        {...props}
      >
        {loading ? (
          <>
            {hasProgress ? (
              <ProgressSpinner progress={progress} className="shrink-0" />
            ) : (
              <LoadingSpinner className="motion-safe:animate-spin" />
            )}
            {!iconOnly && (
              <span className="opacity-0" aria-hidden="true">
                {children}
              </span>
            )}
            <span className="sr-only">
              {hasProgress
                ? `Завантаження ${Math.round(progress)}%`
                : "Завантаження…"}
            </span>
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);

// Loading spinner component. Always decorative — SR announcement is handled by
// the sr-only "Завантаження…" sibling in Button.
function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn("h-4 w-4", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

// Determinate progress spinner with circular progress ring
function ProgressSpinner({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) {
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn("h-4 w-4", className)}
      viewBox="0 0 18 18"
    >
      {/* Background circle */}
      <circle
        cx="9"
        cy="9"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.25"
      />
      {/* Progress circle */}
      <circle
        cx="9"
        cy="9"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        transform="rotate(-90 9 9)"
        className="transition-[stroke-dashoffset] duration-200 ease-out"
      />
    </svg>
  );
}
