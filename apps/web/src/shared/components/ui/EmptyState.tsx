/**
 * @status Active
 * @owner @Skords-01
 *
 * Sergeant Design System — `<EmptyState>` primitive.
 *
 * One canonical "we have nothing to show / something went wrong" surface
 * for every empty / error state across the web app. Replaces the per-page
 * naked-string placeholders that used to drift in copy, focus styling,
 * and a11y wiring.
 *
 * Slots (all optional except `title`):
 * - `illustration` — large SVG (preferred for full-page surfaces); when
 *   passed, the smaller `icon` slot is suppressed.
 * - `icon` — compact glyph for dense surfaces (in-card placeholders).
 * - `eyebrow` — short tag above the title (e.g. "404", "ERROR", "WARNING").
 * - `title` — single-line headline (required for SR announcement).
 * - `description` — supporting copy under the title.
 * - `action` / `primaryAction` — CTA button.
 * - `secondaryAction` — supportive button next to the primary CTA.
 * - `tertiaryLink` — text link (e.g. "Дізнатись більше").
 * - `hint` — small lightbulb-prefixed footer note.
 * - `examplePreview` — optional inline mock of what real data would look like.
 *
 * Sizes (`size: sm | md | lg`):
 * - `sm` (compact): in-card / inline empty placeholder
 * - `md` (default): full-page empty states inside Card or page bodies
 * - `lg`: error pages (`/404`, `/500`, `/offline`)
 *
 * Variants (`variant: neutral | info | success | warning | danger`):
 * - Drives the icon container tint and the eyebrow chip colour. Module
 *   accents (`module: finyk | fizruk | routine | nutrition`) are an
 *   orthogonal axis and take precedence over `variant` when both are set,
 *   because module belongingness is a stronger semantic signal than tone.
 *   Saturated brand fills used as background for white text always go
 *   through `-strong` companions (Hard Rule #9).
 *
 * Backward compat:
 * - `compact: true` keeps working — maps to `size="sm"`.
 *
 * A11y:
 * - Renders inside a `role="status"` + `aria-live="polite"` +
 *   `aria-atomic="true"` live region so SR users get a single
 *   "title + description" announcement when the empty state appears
 *   dynamically (e.g. after a filter clears).
 * - `focus-visible:` only on CTAs (delegated to `<Button>` / `<a>`), per
 *   Hard Rule #14.
 */
import type { ReactNode } from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { ModuleEmptyIllustration } from "./EmptyStateIllustrations";

export type EmptyStateSize = "sm" | "md" | "lg";

export type EmptyStateVariant =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export interface EmptyStateProps {
  icon?: ReactNode;
  illustration?: ReactNode;
  /** Short caps tag above the title (e.g. "404", "ERROR"). */
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  /**
   * Primary CTA. `action` is the original (pre-Track-8) name and stays
   * supported; `primaryAction` is the explicit alias new code should
   * prefer. When both are passed, `primaryAction` wins.
   */
  action?: ReactNode;
  primaryAction?: ReactNode;
  /** Supportive action shown next to the primary CTA (same row). */
  secondaryAction?: ReactNode;
  /** Tertiary link slot — typically an `<a>` for "Learn more" / "Docs". */
  tertiaryLink?: ReactNode;
  className?: string;
  /**
   * Compact density. Deprecated alias for `size="sm"`. Retained for the
   * existing call-sites that pass `compact` — new code should pass
   * `size="sm"` instead.
   */
  compact?: boolean;
  /** Density token. Defaults to `md`. `sm` matches the legacy `compact` look. */
  size?: EmptyStateSize;
  /**
   * Semantic tone. Drives the icon container tint and eyebrow chip
   * colour. `module` overrides it when both are set.
   */
  variant?: EmptyStateVariant;
  /** Disable entry animation (useful inside already-animated containers). */
  disableAnimation?: boolean;
  hint?: string;
  examplePreview?: ReactNode;
  /** Tint the icon container with a module accent (orthogonal to variant). */
  module?: ModuleAccent;
  /**
   * Override live-region politeness. Default `"polite"`. Set to `"off"`
   * for empty states that mount on initial page load alongside other
   * landmark content (the heading already covers the announcement).
   */
  ariaLive?: "polite" | "off";
}

interface TonePalette {
  container: string;
  icon: string;
  eyebrow: string;
}

const NEUTRAL_TONE: TonePalette = {
  container: "bg-panelHi border-line text-subtle",
  icon: "text-brand-500/70",
  eyebrow: "bg-panelHi text-subtle border border-line",
};

// `-strong` companions on the chip text keep contrast at ≥4.5:1 on the
// `-soft` background per Hard Rule #9 — the saturated brand surfaces
// underneath chip text always pair with `-strong` foregrounds.
const VARIANT_TONE: Record<EmptyStateVariant, TonePalette> = {
  neutral: NEUTRAL_TONE,
  info: {
    container: "bg-info-soft border-info/30 text-info-strong",
    icon: "text-info-strong/80",
    eyebrow:
      "bg-info-soft text-info-strong border border-info/30 dark:text-sky-100",
  },
  success: {
    container: "bg-success-soft border-success/30 text-success-strong",
    icon: "text-success-strong/80",
    eyebrow:
      "bg-success-soft text-success-strong border border-success/30 dark:text-emerald-100",
  },
  warning: {
    container: "bg-warning-soft border-warning/30 text-warning-strong",
    icon: "text-warning-strong/80",
    eyebrow:
      "bg-warning-soft text-warning-strong border border-warning/30 dark:text-amber-100",
  },
  danger: {
    container: "bg-danger-soft border-danger/30 text-danger-strong",
    icon: "text-danger-strong/80",
    eyebrow:
      "bg-danger-soft text-danger-strong border border-danger/30 dark:text-red-100",
  },
};

const MODULE_TONE: Record<ModuleAccent, TonePalette> = {
  finyk: {
    container: "bg-finyk/10 border-finyk/20 text-finyk",
    icon: "text-finyk/70",
    eyebrow: "bg-finyk-soft text-finyk border border-finyk/30",
  },
  fizruk: {
    container: "bg-fizruk/10 border-fizruk/20 text-fizruk",
    icon: "text-fizruk/70",
    eyebrow: "bg-fizruk-soft text-fizruk border border-fizruk/30",
  },
  routine: {
    container: "bg-routine/10 border-routine/20 text-routine",
    icon: "text-routine/70",
    eyebrow: "bg-routine-soft text-routine border border-routine/30",
  },
  nutrition: {
    container: "bg-nutrition/10 border-nutrition/20 text-nutrition",
    icon: "text-nutrition/70",
    eyebrow: "bg-nutrition-soft text-nutrition border border-nutrition/30",
  },
};

interface SizeTokens {
  outer: string;
  iconBox: string;
  title: string;
  description: string;
  descriptionMax: string;
  eyebrow: string;
  actionGap: string;
}

const SIZE_TOKENS: Record<EmptyStateSize, SizeTokens> = {
  sm: {
    outer: "py-8 px-4 gap-2",
    iconBox: "w-10 h-10",
    title: "text-style-label",
    description: "text-xs",
    descriptionMax: "max-w-xs",
    eyebrow: "text-2xs",
    actionGap: "mt-1 gap-2",
  },
  md: {
    outer: "py-14 px-6 gap-3",
    iconBox: "w-14 h-14",
    title: "text-base font-semibold",
    description: "text-sm",
    descriptionMax: "max-w-sm",
    eyebrow: "text-2xs",
    actionGap: "mt-2 gap-3",
  },
  lg: {
    outer: "py-20 px-8 gap-4",
    iconBox: "w-20 h-20",
    title: "text-xl font-extrabold",
    description: "text-base",
    descriptionMax: "max-w-md",
    eyebrow: "text-xs",
    actionGap: "mt-3 gap-3",
  },
};

function resolveTone(
  module: ModuleAccent | undefined,
  variant: EmptyStateVariant,
): TonePalette {
  if (module) return MODULE_TONE[module];
  return VARIANT_TONE[variant];
}

function resolveSize(
  size: EmptyStateSize | undefined,
  compact: boolean,
): EmptyStateSize {
  if (size) return size;
  return compact ? "sm" : "md";
}

export function EmptyState({
  icon,
  illustration,
  eyebrow,
  title,
  description,
  action,
  primaryAction,
  secondaryAction,
  tertiaryLink,
  className,
  compact = false,
  size,
  variant = "neutral",
  disableAnimation = false,
  hint,
  examplePreview,
  module,
  ariaLive = "polite",
}: EmptyStateProps) {
  const resolvedSize = resolveSize(size, compact);
  const tokens = SIZE_TOKENS[resolvedSize];
  const tone = resolveTone(module, variant);
  const isSm = resolvedSize === "sm";
  const primary = primaryAction ?? action;
  return (
    // `role="status"` + `aria-live="polite"` keep the empty-state silent
    // until it appears dynamically (e.g. after a filter clears the list).
    // SR then announces `title` + `description` together via `aria-atomic`.
    <div
      role="status"
      aria-live={ariaLive}
      aria-atomic="true"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        tokens.outer,
        !disableAnimation &&
          "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300",
        className,
      )}
    >
      {illustration ? (
        <div
          aria-hidden="true"
          className={cn(
            "flex items-center justify-center",
            !disableAnimation &&
              "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-300 motion-safe:delay-75",
          )}
        >
          {illustration}
        </div>
      ) : (
        icon && (
          <div
            aria-hidden="true"
            className={cn(
              "flex items-center justify-center rounded-2xl border",
              tone.container,
              tokens.iconBox,
              !disableAnimation &&
                "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-300 motion-safe:delay-75",
            )}
          >
            {icon}
          </div>
        )
      )}
      {eyebrow && (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 font-bold uppercase tracking-widest",
            tokens.eyebrow,
            tone.eyebrow,
          )}
        >
          {eyebrow}
        </span>
      )}
      <p className={cn("text-text text-balance", tokens.title)}>{title}</p>
      {description && (
        <p
          className={cn(
            "text-muted leading-relaxed text-pretty",
            tokens.description,
            tokens.descriptionMax,
          )}
        >
          {description}
        </p>
      )}
      {examplePreview && (
        <div
          className={cn(
            "w-full mt-2 p-3 rounded-xl bg-panel/50 border border-dashed border-line/60",
            tokens.descriptionMax,
            !disableAnimation &&
              "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 motion-safe:delay-100",
          )}
        >
          {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift -- intentional example label */}
          <p className="text-2xs text-muted mb-2 uppercase tracking-wide font-medium">
            Приклад
          </p>
          {examplePreview}
        </div>
      )}
      {(primary || secondaryAction) && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-center",
            tokens.actionGap,
            !disableAnimation &&
              "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:delay-150",
          )}
        >
          {primary}
          {secondaryAction}
        </div>
      )}
      {tertiaryLink && (
        <div
          className={cn(
            "mt-1",
            !disableAnimation &&
              "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 motion-safe:delay-200",
          )}
        >
          {tertiaryLink}
        </div>
      )}
      {hint && (
        <p
          className={cn(
            "flex items-center gap-1.5 text-2xs text-subtle mt-2",
            !disableAnimation &&
              "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 motion-safe:delay-200",
          )}
        >
          <Icon
            name="lightbulb"
            size={isSm ? 12 : 14}
            aria-hidden="true"
            className={tone.icon}
          />
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Module-specific empty state with contextual guidance. Wraps `<EmptyState>`
 * with the canonical title / description / hint / example for the
 * requested module so each module sticks to one onboarding pattern.
 */
export interface ModuleEmptyStateProps {
  module: "finyk" | "fizruk" | "routine" | "nutrition";
  variant?: "default" | "compact";
  onAction?: () => void;
  actionLabel?: string;
  /** Show a dismiss/close button in the top-right corner. */
  dismissible?: boolean;
  onDismiss?: () => void;
  description?: string;
  className?: string;
}

interface ModuleConfig {
  icon: string;
  title: string;
  description: string;
  hint: string;
  actionLabel: string;
  accent: string;
  exampleLine1: string;
  exampleLine2: string;
}

const MODULE_EMPTY_CONFIG: Record<
  ModuleEmptyStateProps["module"],
  ModuleConfig
> = {
  finyk: {
    icon: "credit-card",
    title: "Почни вести фінанси",
    description: "Додай першу витрату і побач куди йдуть гроші.",
    hint: "Порада: Підключи Monobank для автоматичного імпорту",
    actionLabel: "Додати витрату",
    accent: "text-finyk bg-finyk-soft dark:bg-finyk/10",
    exampleLine1: "Кава",
    exampleLine2: "-85 ₴ · Сьогодні",
  },
  fizruk: {
    icon: "dumbbell",
    title: "Час тренуватись",
    description: "Запиши першу тренування або обери готову програму.",
    hint: "Порада: Почни з 10-хвилинної розминки",
    actionLabel: "Почати тренування",
    accent: "text-fizruk bg-fizruk-soft dark:bg-fizruk/10",
    exampleLine1: "Ранкова розминка",
    exampleLine2: "10 хв · 5 вправ",
  },
  routine: {
    icon: "check-circle",
    title: "Створи першу звичку",
    description: "Маленькі кроки щодня ведуть до великих змін.",
    hint: "Порада: Почни з однієї звички, яку точно виконаєш",
    actionLabel: "Створити звичку",
    accent: "text-routine bg-routine-surface dark:bg-routine/10",
    exampleLine1: "Пити воду",
    exampleLine2: "Щодня · Серія: 0 днів",
  },
  nutrition: {
    icon: "utensils",
    title: "Залогай перший прийом їжі",
    description: "Відстежуй що їси і отримай персональні поради.",
    hint: "Порада: Сфоткай страву — AI порахує калорії",
    actionLabel: "Додати їжу",
    accent: "text-nutrition bg-nutrition-soft dark:bg-nutrition/10",
    exampleLine1: "Сніданок",
    exampleLine2: "420 ккал · Б: 15г | Ж: 12г | В: 58г",
  },
};

export function ModuleEmptyState({
  module,
  variant = "default",
  onAction,
  actionLabel,
  dismissible = false,
  onDismiss,
  description: descriptionOverride,
  className,
}: ModuleEmptyStateProps) {
  const config = MODULE_EMPTY_CONFIG[module];
  const compact = variant === "compact";

  const examplePreview = (
    <div className="flex items-center gap-3 text-left">
      <div
        className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
          config.accent,
        )}
      >
        <Icon name={config.icon} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-style-label text-text truncate">
          {config.exampleLine1}
        </p>
        <p className="text-xs text-muted">{config.exampleLine2}</p>
      </div>
    </div>
  );

  return (
    <div className="relative">
      {dismissible && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Закрити"
          className={cn(
            "absolute top-2 right-2 p-1.5 rounded-xl text-muted hover:text-text hover:bg-panelHi transition-colors z-10",
            // Hard Rule #14 — visible focus indicator via focus-visible:
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
          )}
        >
          <Icon name="x" size={16} aria-hidden="true" />
        </button>
      )}
      <EmptyState
        // Compact keeps the small icon-in-rounded-square for dense
        // surfaces; the default surface promotes to a module-shaped SVG
        // illustration which carries far more recognisability than the
        // generic lucide glyph the empty state used to render.
        icon={
          compact ? (
            <Icon
              name={config.icon}
              size="lg"
              className={config.accent.split(" ")[0]}
            />
          ) : undefined
        }
        illustration={
          compact ? undefined : (
            <ModuleEmptyIllustration
              module={module}
              size={120}
              className="text-text"
            />
          )
        }
        title={config.title}
        description={descriptionOverride ?? config.description}
        hint={config.hint}
        examplePreview={!compact ? examplePreview : undefined}
        size={compact ? "sm" : "md"}
        className={className}
        module={module}
        action={
          onAction && (
            <Button
              variant="primary"
              size={compact ? "sm" : "md"}
              onClick={onAction}
            >
              {actionLabel || config.actionLabel}
            </Button>
          )
        }
      />
    </div>
  );
}
