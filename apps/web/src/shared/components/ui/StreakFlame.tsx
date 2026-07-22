import { memo } from "react";
import { cn } from "../../lib/ui/cn";
import { Icon } from "./Icon";

/**
 * Sergeant Design System -- StreakFlame
 *
 * Visual streak flame indicator with pulsing glow animation.
 * Used across modules to display consecutive-day streaks with
 * colour intensity that scales with streak length.
 *
 * Features:
 * - Size variants: sm, md, lg, xl
 * - Glow animation intensity based on streak count
 * - Milestone celebrations at 7, 14, 30, 60, 90, 100, 365 days
 * - Reduced motion support
 *
 * @example
 * ```tsx
 * <StreakFlame streak={7} />
 * <StreakFlame streak={30} size="lg" showLabel />
 * <StreakBadge streak={14} label="14 days" />
 * ```
 */

export type StreakFlameSize = "sm" | "md" | "lg" | "xl";

const sizeStyles: Record<
  StreakFlameSize,
  { icon: number; text: string; wrapper: string }
> = {
  sm: { icon: 14, text: "text-xs", wrapper: "w-6 h-6" },
  md: { icon: 20, text: "text-sm", wrapper: "w-8 h-8" },
  lg: { icon: 28, text: "text-base", wrapper: "w-12 h-12" },
  xl: { icon: 36, text: "text-lg", wrapper: "w-16 h-16" },
};

/**
 * Драбина «жару» серії. Раніше це була ротація ЧУЖИХ hue —
 * yellow → amber → orange → red → pink → violet: п'ять родин, яких немає в
 * палітрі Sergeant, і жодна не пов'язана з модулем, до якого серія
 * належить. Дизайн-аудит 2026-07 (цикл 3) зберіг ідею «жар росте», але
 * замінив матеріал: одна бренд-родина coral (рідний hue Рутини, той самий,
 * що `--c-streak-glow`) від блідого до насиченого, і `--c-celebration`
 * (amber) на сотій добі — сота доба і Є святкування, семантика токена точна.
 *
 * Відомий борг (не регресія — успадкований): на білому тлі нижні тири
 * coral-300/400 не витягують 3:1 як не-текстовий елемент. Стара драбина
 * (yellow-500 ≈ 1.9:1) була гіршою; повний фікс потребує тем-залежних
 * тирів і йде окремо.
 */
function getFlameIntensity(streak: number): {
  color: string;
  glow: string;
  glowSize: string;
} {
  if (streak >= 100) {
    return {
      color: "text-celebration",
      glow: "shadow-celebration/50",
      glowSize: "shadow-xl",
    };
  }
  if (streak >= 60) {
    return {
      color: "text-coral-700",
      glow: "shadow-coral-700/40",
      glowSize: "shadow-lg",
    };
  }
  if (streak >= 30) {
    return {
      color: "text-coral-600",
      glow: "shadow-coral-600/40",
      glowSize: "shadow-lg",
    };
  }
  if (streak >= 14) {
    return {
      color: "text-coral-500",
      glow: "shadow-coral-500/30",
      glowSize: "shadow-md",
    };
  }
  if (streak >= 7) {
    return {
      color: "text-coral-400",
      glow: "shadow-coral-400/30",
      glowSize: "shadow-md",
    };
  }
  if (streak >= 3) {
    return {
      color: "text-coral-300",
      glow: "shadow-coral-300/20",
      glowSize: "shadow-sm",
    };
  }
  return {
    color: "text-muted",
    glow: "",
    glowSize: "",
  };
}

const MILESTONES = new Set([7, 14, 21, 30, 60, 90, 100, 365]);

export interface StreakFlameProps {
  streak: number;
  size?: StreakFlameSize;
  showLabel?: boolean;
  showMilestone?: boolean;
  className?: string;
}

export const StreakFlame = memo(function StreakFlame({
  streak,
  size = "md",
  showLabel = false,
  showMilestone = true,
  className,
}: StreakFlameProps) {
  const styles = sizeStyles[size];
  const intensity = getFlameIntensity(streak);
  const isMilestone = showMilestone && MILESTONES.has(streak);

  if (streak <= 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full",
          styles.wrapper,
          "text-muted opacity-40",
          className,
        )}
        aria-label={`Streak: ${streak} days`}
      >
        <Icon name="zap" size={styles.icon} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center relative",
        className,
      )}
      role="img"
      aria-label={`Streak: ${streak} days`}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full",
          styles.wrapper,
          intensity.color,
          intensity.glow,
          intensity.glowSize,
          streak >= 7 && "motion-safe:animate-streak-glow",
          isMilestone && "motion-safe:animate-celebration-pop",
        )}
      >
        <Icon name="zap" size={styles.icon} strokeWidth={2.5} />
      </span>

      {showLabel && (
        <span
          className={cn(
            "ml-1.5 font-bold tabular-nums",
            styles.text,
            intensity.color,
          )}
        >
          {streak}
        </span>
      )}
    </span>
  );
});

/**
 * StreakBadge -- Pill-shaped badge with streak flame and count.
 * Designed for inline use in cards, list items, and headers.
 */
export interface StreakBadgeProps {
  streak: number;
  label?: string;
  className?: string;
}

export const StreakBadge = memo(function StreakBadge({
  streak,
  label,
  className,
}: StreakBadgeProps) {
  const intensity = getFlameIntensity(streak);

  if (streak <= 0) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
        "bg-panel-hi border border-line",
        "text-style-label",
        intensity.color,
        className,
      )}
      role="status"
      aria-label={`Streak: ${streak} ${label || "days"}`}
    >
      <Icon name="zap" size={14} strokeWidth={2.5} />
      <span className="tabular-nums">{streak}</span>
      {label && <span className="text-style-caption text-muted">{label}</span>}
    </span>
  );
});
