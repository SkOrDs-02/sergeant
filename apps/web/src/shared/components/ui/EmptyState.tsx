import type { ReactNode } from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";
import { cn } from "@shared/lib/cn";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { ModuleEmptyIllustration } from "./EmptyStateIllustrations";

export interface EmptyStateProps {
  icon?: ReactNode;
  /**
   * Larger module-shaped SVG illustration rendered above the title in place
   * of the small icon-in-rounded-square container. When both `illustration`
   * and `icon` are provided, `illustration` wins and the icon is dropped —
   * the two leading visuals serve the same role and stacking them looks
   * cluttered. Use `icon` for tiny, dense surfaces (compact, inline) and
   * `illustration` for full-bleed empty states.
   */
  illustration?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
  /** Disable entry animation (useful when already inside animated container) */
  disableAnimation?: boolean;
  /** Optional hint text shown below the main content */
  hint?: string;
  /** Optional example data preview */
  examplePreview?: ReactNode;
  /** When set, the leading icon container and hint icon are tinted with
   *  the module accent so the empty state visually belongs to its host
   *  module instead of the neutral grey default. */
  module?: ModuleAccent;
}

const MODULE_ICON_TINT: Record<
  ModuleAccent,
  { container: string; icon: string }
> = {
  finyk: {
    container: "bg-finyk/10 border-finyk/20 text-finyk",
    icon: "text-finyk/70",
  },
  fizruk: {
    container: "bg-fizruk/10 border-fizruk/20 text-fizruk",
    icon: "text-fizruk/70",
  },
  routine: {
    container: "bg-routine/10 border-routine/20 text-routine",
    icon: "text-routine/70",
  },
  nutrition: {
    container: "bg-nutrition/10 border-nutrition/20 text-nutrition",
    icon: "text-nutrition/70",
  },
};

export function EmptyState({
  icon,
  illustration,
  title,
  description,
  action,
  className,
  compact = false,
  disableAnimation = false,
  hint,
  examplePreview,
  module,
}: EmptyStateProps) {
  const accent = module ? MODULE_ICON_TINT[module] : null;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-8 px-4 gap-2" : "py-14 px-6 gap-3",
        // Entry animation with staggered children
        !disableAnimation &&
          "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300",
        className,
      )}
    >
      {illustration ? (
        <div
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
            className={cn(
              "flex items-center justify-center rounded-2xl border",
              accent ? accent.container : "bg-panelHi border-line text-subtle",
              compact ? "w-10 h-10" : "w-14 h-14",
              // Staggered icon animation
              !disableAnimation &&
                "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-300 motion-safe:delay-75",
            )}
          >
            {icon}
          </div>
        )
      )}
      <p
        className={cn(
          "font-semibold text-text text-balance",
          compact ? "text-sm" : "text-base",
        )}
      >
        {title}
      </p>
      {description && (
        <p
          className={cn(
            "text-muted leading-relaxed max-w-xs text-pretty",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {description}
        </p>
      )}
      {examplePreview && (
        <div
          className={cn(
            "w-full max-w-sm mt-2 p-3 rounded-xl bg-panel/50 border border-dashed border-line/60",
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
      {action && (
        <div
          className={cn(
            "mt-1",
            // Staggered action button animation
            !disableAnimation &&
              "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:delay-150",
          )}
        >
          {action}
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
            size={12}
            className={cn(accent ? accent.icon : "text-brand-500/70")}
          />
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Module-specific empty state with contextual guidance.
 * Provides a richer onboarding experience for each module.
 */
export interface ModuleEmptyStateProps {
  module: "finyk" | "fizruk" | "routine" | "nutrition";
  variant?: "default" | "compact";
  onAction?: () => void;
  actionLabel?: string;
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
    exampleLine2: "Щодня · Стрік: 0 днів",
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
        <p className="text-sm font-medium text-text truncate">
          {config.exampleLine1}
        </p>
        <p className="text-xs text-muted">{config.exampleLine2}</p>
      </div>
    </div>
  );

  return (
    <EmptyState
      // Compact variant keeps the small icon-in-rounded-square so it fits
      // dense surfaces (in-list placeholders, sidebar panels). The default
      // (full-bleed) variant promotes to a module-shaped SVG illustration
      // which carries far more personality and recognisability than the
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
      description={config.description}
      hint={config.hint}
      examplePreview={!compact ? examplePreview : undefined}
      compact={compact}
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
  );
}
