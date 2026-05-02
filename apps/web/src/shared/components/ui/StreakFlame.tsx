import { memo } from "react";
import { cn } from "../../lib/cn";
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

function getFlameIntensity(streak: number): {
  color: string;
  glow: string;
  glowSize: string;
} {
  if (streak >= 100) {
    return {
      color: "text-violet-500",
      glow: "shadow-violet-500/50",
      glowSize: "shadow-xl",
    };
  }
  if (streak >= 60) {
    return {
      color: "text-pink-500",
      glow: "shadow-pink-500/40",
      glowSize: "shadow-lg",
    };
  }
  if (streak >= 30) {
    return {
      color: "text-red-500",
      glow: "shadow-red-500/40",
      glowSize: "shadow-lg",
    };
  }
  if (streak >= 14) {
    return {
      color: "text-orange-500",
      glow: "shadow-orange-500/30",
      glowSize: "shadow-md",
    };
  }
  if (streak >= 7) {
    return {
      color: "text-amber-500",
      glow: "shadow-amber-500/30",
      glowSize: "shadow-md",
    };
  }
  if (streak >= 3) {
    return {
      color: "text-yellow-500",
      glow: "shadow-yellow-500/20",
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
        "text-sm font-semibold",
        intensity.color,
        className,
      )}
      role="status"
      aria-label={`Streak: ${streak} ${label || "days"}`}
    >
      <Icon name="zap" size={14} strokeWidth={2.5} />
      <span className="tabular-nums">{streak}</span>
      {label && <span className="text-muted text-xs font-medium">{label}</span>}
    </span>
  );
});
