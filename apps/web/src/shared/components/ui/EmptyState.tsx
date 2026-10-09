/**
 * Last validated: 2026-05-19
 * Status: Active
 */
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
import type { OnboardingGoals } from "@sergeant/shared";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { formatNumberUk, NARROW_NBSP } from "@sergeant/shared";
import { coreMessages } from "@shared/i18n/uk.core";

export type EmptyStateSize = "sm" | "md" | "lg";

export type EmptyStateVariant =
  "neutral" | "info" | "success" | "warning" | "danger";

export interface EmptyStateProps {
  /** @deprecated мова H: не рендериться. @removeBy 2026-12-01 */
  icon?: ReactNode | undefined;
  /** @deprecated мова H: не рендериться. @removeBy 2026-12-01 */
  illustration?: ReactNode | undefined;
  /** Ярлик над фактом (12 / 600 / caps), напр. «404». */
  eyebrow?: ReactNode | undefined;
  title?: ReactNode | undefined;
  /**
   * Element used for `title`. Defaults to `p`, because an empty state is
   * normally nested inside a page that already owns the heading — emitting
   * a heading there would inject an arbitrary level into the outline.
   * Pass a heading level when the empty state *is* the whole page (the 404
   * surface), otherwise that page ships with no heading at all.
   */
  titleAs?: "p" | "h1" | "h2" | "h3" | undefined;
  description?: ReactNode | undefined;
  /**
   * Primary CTA. `action` is the original (pre-Track-8) name and stays
   * supported; `primaryAction` is the explicit alias new code should
   * prefer. When both are passed, `primaryAction` wins.
   */
  action?: ReactNode | undefined;
  primaryAction?: ReactNode | undefined;
  /** Supportive action shown next to the primary CTA (same row). */
  secondaryAction?: ReactNode | undefined;
  /** Tertiary link slot — typically an `<a>` for "Learn more" / "Docs". */
  tertiaryLink?: ReactNode | undefined;
  className?: string | undefined;
  /**
   * Compact density. Deprecated alias for `size="sm"`. Retained for the
   * existing call-sites that pass `compact` — new code should pass
   * `size="sm"` instead.
   */
  compact?: boolean | undefined;
  /** Density token. Defaults to `md`. `sm` matches the legacy `compact` look. */
  size?: EmptyStateSize | undefined;
  /** @deprecated мова H: не рендериться. @removeBy 2026-12-01 */
  variant?: EmptyStateVariant | undefined;
  /** @deprecated мова H: не рендериться. @removeBy 2026-12-01 */
  disableAnimation?: boolean | undefined;
  /** Рядок мети під дією. */
  hint?: string | undefined;
  /** @deprecated мова H: не рендериться. @removeBy 2026-12-01 */
  examplePreview?: ReactNode | undefined;
  /** @deprecated мова H: не рендериться. @removeBy 2026-12-01 */
  module?: ModuleAccent | undefined;
  /**
   * Override live-region politeness. Default `"polite"`. Set to `"off"`
   * for empty states that mount on initial page load alongside other
   * landmark content (the heading already covers the announcement).
   */
  ariaLive?: "polite" | "off" | undefined;
}

function resolveSize(
  size: EmptyStateSize | undefined,
  compact: boolean,
): EmptyStateSize {
  if (size) return size;
  return compact ? "sm" : "md";
}

const PADDING: Record<EmptyStateSize, string> = {
  sm: "py-4",
  md: "py-6",
  lg: "py-10",
};

/**
 * Мова H (redesign v3): факт одним рядком 16 / 600, під ним дія кнопкою
 * outline. Без іконки в колі, ілюстрації й «Прикладу» в пунктирі: ці пропи
 * ще приймаються, але не рендеряться (@removeBy 2026-12-01, PR7). Текстові
 * пропи лишаються текстом: `eyebrow` ярликом над фактом, `description` і
 * `hint` рядками мети другим сірим.
 */
export function EmptyState({
  eyebrow,
  hint,
  title,
  titleAs: TitleTag = "p",
  description,
  action,
  primaryAction,
  secondaryAction,
  tertiaryLink,
  className,
  compact = false,
  size,
  ariaLive = "polite",
}: EmptyStateProps) {
  const resolvedSize = resolveSize(size, compact);
  const primary = primaryAction ?? action;
  return (
    // `role="status"` + `aria-live="polite"` keep the empty-state silent
    // until it appears dynamically (e.g. after a filter clears the list).
    <div
      role="status"
      aria-live={ariaLive}
      aria-atomic="true"
      className={cn("flex flex-col gap-1", PADDING[resolvedSize], className)}
    >
      {eyebrow && <p className="text-style-overline text-subtle">{eyebrow}</p>}
      <TitleTag className="text-style-body font-semibold text-text text-pretty">
        {title}
      </TitleTag>
      {description && (
        <p className="text-style-label text-muted text-pretty">{description}</p>
      )}
      {(primary || secondaryAction) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {primary}
          {secondaryAction}
        </div>
      )}
      {tertiaryLink && <div className="mt-1">{tertiaryLink}</div>}
      {hint && (
        <p className="mt-2 text-style-label text-muted text-pretty">{hint}</p>
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
  /**
   * Onboarding goals snapshot from `getOnboardingGoals(webKVStore)`.
   * When provided, the description adapts to the user's saved goal
   * (e.g. budget amount, weekly training target) so the copy feels
   * personal rather than generic. Callers should pass this whenever
   * the module goal state is already available in their render scope.
   */
  goalContext?: OnboardingGoals;
  className?: string;
}

interface ModuleConfig {
  title: string;
  description: string;
  hint: string;
  /**
   * Optional — only meaningful when a call-site actually passes `onAction`.
   * Founder-UX audit round 2 (F1) flagged `finyk`'s `actionLabel` as dead:
   * both `Overview.tsx` and `TransactionList.tsx` render `ModuleEmptyState
   * module="finyk"` without `onAction` on purpose (the global "+ Додати
   * витрату" FAB already owns that CTA), so the label sat in the config
   * with nothing ever reading it.
   */
  actionLabel?: string;
  exampleLine1: string;
  exampleLine2: string;
}

// Копія в `coreMessages.moduleEmpty` (чому саме там, а не в модульних
// каталогах, пояснено біля неї).
const MODULE_EMPTY_CONFIG: Record<
  ModuleEmptyStateProps["module"],
  ModuleConfig
> = {
  finyk: {
    // `actionLabel` навмисно відсутній — див. коментар над `ModuleConfig`.
    ...coreMessages.moduleEmpty.finyk,
  },
  fizruk: {
    ...coreMessages.moduleEmpty.fizruk,
  },
  routine: {
    ...coreMessages.moduleEmpty.routine,
  },
  nutrition: {
    ...coreMessages.moduleEmpty.nutrition,
  },
};

/**
 * Derives a goal-personalised description for the module's empty state.
 * Mirrors the `getGoalAwareDesc` logic in `FirstActionSheet` — when the
 * user set a concrete goal during onboarding, the copy anchors on that
 * goal; when no goal is recorded, the generic outcome description is
 * returned unchanged.
 */
function resolveGoalAwareDesc(
  moduleId: ModuleEmptyStateProps["module"],
  fallback: string,
  goals: OnboardingGoals,
): string {
  if (moduleId === "finyk" && goals.finykBudget) {
    return `Встанови бюджет ${formatNumberUk(goals.finykBudget)}${NARROW_NBSP}₴ і додай першу витрату.`;
  }
  if (moduleId === "fizruk" && goals.fizrukWeeklyGoal) {
    return `${goals.fizrukWeeklyGoal}× на тиждень, починай із першого тренування.`;
  }
  if (moduleId === "routine" && goals.routineFirstHabit) {
    const habitLabels: Record<string, string> = {
      water: "«Пити воду»",
      exercise: "«Зарядка»",
      reading: "«Читання»",
    };
    const label = habitLabels[goals.routineFirstHabit] ?? "свою звичку";
    return `Познач ${label} сьогодні, і серія почнеться.`;
  }
  if (moduleId === "nutrition" && goals.nutritionGoal) {
    const goalLabels: Record<string, string> = {
      lose: "схуднути",
      gain: "набрати масу",
      maintain: "підтримувати вагу",
    };
    const goalLabel = goalLabels[goals.nutritionGoal] ?? goals.nutritionGoal;
    return `Ціль «${goalLabel}», запиши перший прийом їжі.`;
  }
  return fallback;
}

export function ModuleEmptyState({
  module,
  variant = "default",
  onAction,
  actionLabel,
  dismissible = false,
  onDismiss,
  description: descriptionOverride,
  goalContext,
  className,
}: ModuleEmptyStateProps) {
  const config = MODULE_EMPTY_CONFIG[module];
  const compact = variant === "compact";

  // Explicit `description` override wins; otherwise use goal-aware copy
  // when caller provided `goalContext`, falling back to config default.
  const resolvedDescription =
    descriptionOverride ??
    (goalContext
      ? resolveGoalAwareDesc(module, config.description, goalContext)
      : config.description);

  return (
    <div className="relative">
      {dismissible && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Закрити"
          className={cn(
            "absolute top-2 right-2 p-1.5 rounded-lg text-muted hover:text-text hover:bg-panelHi transition-colors z-10",
            // Hard Rule #14 — visible focus indicator via focus-visible:
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
          )}
        >
          <Icon name="close" size="md" aria-hidden="true" />
        </button>
      )}
      <EmptyState
        title={config.title}
        description={resolvedDescription}
        size={compact ? "sm" : "md"}
        className={className}
        action={
          onAction && (
            <Button
              variant="outline"
              size={compact ? "sm" : "md"}
              onClick={onAction}
            >
              {/* Fallback for modules (currently only `finyk`) whose config
                  has no `actionLabel` — the button only renders when the
                  caller passes `onAction`, so a caller that does so without
                  an explicit `actionLabel` still gets a labelled button. */}
              {actionLabel ?? config.actionLabel ?? "Додати"}
            </Button>
          )
        }
      />
    </div>
  );
}
