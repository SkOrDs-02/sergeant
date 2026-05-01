import { memo, useState, useCallback, useRef, useEffect } from "react";
import { cn } from "../../lib/cn";
import { hapticTap, hapticSuccess } from "../../lib/haptic";
import { Icon } from "./Icon";

/**
 * Sergeant Design System -- AnimatedCheckbox
 *
 * A checkbox with satisfying completion animations:
 * - SVG stroke-draw for the checkmark
 * - Scale bounce on check
 * - Optional confetti burst on completion
 * - Haptic feedback
 *
 * Variants match module semantic tokens (finyk, fizruk, routine, nutrition).
 *
 * @example
 * ```tsx
 * <AnimatedCheckbox checked={done} onChange={setDone} variant="routine" />
 * <HabitCheckbox label="Morning run" checked={done} onChange={setDone} streak={5} />
 * ```
 */

export type CheckboxVariant =
  | "default"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition";

export type CheckboxSize = "sm" | "md" | "lg";

const variantStyles: Record<CheckboxVariant, { ring: string; fill: string }> = {
  default: { ring: "ring-brand", fill: "bg-brand-strong text-white" },
  finyk: { ring: "ring-finyk", fill: "bg-finyk-strong text-white" },
  fizruk: { ring: "ring-fizruk", fill: "bg-fizruk-strong text-white" },
  routine: { ring: "ring-routine", fill: "bg-routine-strong text-white" },
  nutrition: { ring: "ring-nutrition", fill: "bg-nutrition-strong text-white" },
};

const sizeStyles: Record<CheckboxSize, { box: string; icon: number }> = {
  sm: { box: "w-5 h-5", icon: 12 },
  md: { box: "w-6 h-6", icon: 14 },
  lg: { box: "w-8 h-8", icon: 18 },
};

export interface AnimatedCheckboxProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  variant?: CheckboxVariant;
  size?: CheckboxSize;
  disabled?: boolean;
  showConfetti?: boolean;
  className?: string;
  "aria-label"?: string;
  /**
   * When `true`, renders a non-interactive visual indicator (no role,
   * no focus, `aria-hidden`). Use when the checkbox is wrapped by an
   * outer interactive element so axe's `nested-interactive` rule
   * stays clean. Animation is then driven from the `checked` prop
   * transitioning `false → true` instead of an internal click handler.
   */
  decorative?: boolean;
}

export const AnimatedCheckbox = memo(function AnimatedCheckbox({
  checked,
  onChange,
  variant = "default",
  size = "md",
  disabled = false,
  showConfetti = false,
  className,
  "aria-label": ariaLabel,
  decorative = false,
}: AnimatedCheckboxProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [confettiParticles, setConfettiParticles] = useState<
    Array<{ id: number; x: number; y: number; color: string; delay: number }>
  >([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const prevCheckedRef = useRef(checked);

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const handleToggle = useCallback(() => {
    if (disabled) return;

    const newValue = !checked;
    onChange?.(newValue);

    if (newValue) {
      hapticSuccess();
      if (!prefersReducedMotion) {
        setIsAnimating(true);
        timeoutRef.current = setTimeout(() => setIsAnimating(false), 400);
      }

      if (showConfetti && !prefersReducedMotion) {
        const colors = ["#10B981", "#F97066", "#84CC16", "#14B8A6", "#F59E0B"];
        const particles = Array.from({ length: 12 }, (_, i) => ({
          id: i,
          x: (Math.random() - 0.5) * 60,
          y: (Math.random() - 0.5) * 60 - 20,
          color: colors[Math.floor(Math.random() * colors.length)],
          delay: Math.random() * 0.2,
        }));
        setConfettiParticles(particles);
        setTimeout(() => setConfettiParticles([]), 800);
      }
    } else {
      hapticTap();
    }
  }, [checked, onChange, disabled, showConfetti, prefersReducedMotion]);

  // In decorative mode the parent owns the click — drive the bounce
  // animation from the `checked` prop transitioning false → true.
  useEffect(() => {
    if (!decorative) {
      prevCheckedRef.current = checked;
      return;
    }
    if (!prevCheckedRef.current && checked && !prefersReducedMotion) {
      setIsAnimating(true);
      timeoutRef.current = setTimeout(() => setIsAnimating(false), 400);
    }
    prevCheckedRef.current = checked;
  }, [checked, decorative, prefersReducedMotion]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const styles = variantStyles[variant];
  const sizes = sizeStyles[size];

  const indicator = (
    <Icon
      name="check"
      size={sizes.icon}
      strokeWidth={3}
      className={cn(
        "text-white",
        !prefersReducedMotion && "motion-safe:animate-check-draw",
      )}
    />
  );

  const visualClass = cn(
    "relative inline-flex items-center justify-center rounded-lg",
    "border-2 transition-all duration-200",
    sizes.box,
    checked ? cn(styles.fill, "border-transparent") : "border-line bg-panel",
    isAnimating && "motion-safe:animate-check-bounce",
    disabled && "opacity-50",
  );

  return (
    <span
      className={cn("relative inline-flex", className)}
      aria-hidden={decorative ? true : undefined}
    >
      {decorative ? (
        <span className={visualClass}>{checked && indicator}</span>
      ) : (
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={handleToggle}
          className={cn(
            visualClass,
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            styles.ring,
            !checked && "hover:border-muted",
            disabled && "cursor-not-allowed",
            !disabled && "cursor-pointer",
          )}
        >
          {checked && indicator}
        </button>
      )}

      {/* Confetti burst */}
      {confettiParticles.length > 0 && (
        <span
          className="absolute inset-0 pointer-events-none overflow-visible"
          aria-hidden="true"
        >
          {confettiParticles.map((p) => (
            <span
              key={p.id}
              className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full animate-confetti-burst"
              style={
                {
                  backgroundColor: p.color,
                  "--tx": `${p.x}px`,
                  "--ty": `${p.y}px`,
                  animationDelay: `${p.delay}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </span>
      )}
    </span>
  );
});

/**
 * HabitCheckbox -- Checkbox with label, optional streak badge.
 * Pre-composed for Routine module habit lists.
 */
export interface HabitCheckboxProps extends Omit<
  AnimatedCheckboxProps,
  "aria-label"
> {
  label: string;
  streak?: number;
  subtitle?: string;
}

export const HabitCheckbox = memo(function HabitCheckbox({
  label,
  streak,
  subtitle,
  checked,
  ...props
}: HabitCheckboxProps) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors",
        "hover:bg-panel-hi/50 cursor-pointer",
        checked && "bg-panel-hi/30",
      )}
    >
      <AnimatedCheckbox
        checked={checked}
        aria-label={label}
        showConfetti={!!streak && streak > 0}
        {...props}
      />
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            "text-sm font-semibold text-text transition-all duration-300",
            checked && "line-through text-muted",
          )}
        >
          {label}
        </span>
        {subtitle && (
          <p className="text-xs text-muted mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
      {streak != null && streak > 0 && (
        <span className="flex items-center gap-1 text-xs font-semibold text-warning">
          <Icon name="zap" size={12} />
          {streak}
        </span>
      )}
    </label>
  );
});
