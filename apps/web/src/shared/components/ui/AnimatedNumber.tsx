import { useEffect, useRef, useState, memo } from "react";
import { cn } from "../../lib/cn";

interface AnimatedNumberProps {
  value: number;
  /** Number of decimal places. Default 0. */
  decimals?: number;
  /** Animation duration in ms. Default 600. */
  duration?: number;
  /** Locale for formatting. Default "uk-UA". */
  locale?: string;
  /** Intl.NumberFormat options for currency, units, etc. */
  formatOptions?: Intl.NumberFormatOptions;
  /** Custom formatter function (overrides locale/formatOptions). */
  formatter?: (value: number) => string;
  /** Additional CSS classes. */
  className?: string;
  /** Prefix (e.g., currency symbol). */
  prefix?: string;
  /** Suffix (e.g., unit). */
  suffix?: string;
  /** Disable animation and show value immediately. */
  immediate?: boolean;
}

/**
 * AnimatedNumber — displays a number with smooth count-up animation.
 *
 * Respects prefers-reduced-motion by showing the final value immediately.
 *
 * Examples:
 * ```tsx
 * <AnimatedNumber value={1234} />
 * <AnimatedNumber value={99.5} decimals={1} suffix="%" />
 * <AnimatedNumber value={5000} prefix="₴" formatOptions={{ useGrouping: true }} />
 * ```
 */
export const AnimatedNumber = memo(function AnimatedNumber({
  value,
  decimals = 0,
  duration = 600,
  locale = "uk-UA",
  formatOptions,
  formatter,
  className,
  prefix = "",
  suffix = "",
  immediate = false,
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Check for reduced motion preference
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    // Skip animation if value hasn't changed, immediate mode, or reduced motion
    if (
      value === previousValueRef.current ||
      immediate ||
      prefersReducedMotion
    ) {
      setDisplayValue(value);
      previousValueRef.current = value;
      return;
    }

    const startValue = previousValueRef.current;
    const endValue = value;
    previousValueRef.current = value;
    startTimeRef.current = null;

    // Easing function: easeOutCubic for smooth deceleration
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);

      const current = startValue + (endValue - startValue) * easedProgress;
      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [value, duration, immediate, prefersReducedMotion]);

  // Format the display value
  const formattedValue = formatter
    ? formatter(displayValue)
    : new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        ...formatOptions,
      }).format(displayValue);

  return (
    <span className={cn("tabular-nums", className)}>
      {prefix}
      {formattedValue}
      {suffix}
    </span>
  );
});

/**
 * AnimatedCurrency — specialized AnimatedNumber for currency values.
 */
export const AnimatedCurrency = memo(function AnimatedCurrency({
  value,
  currency = "UAH",
  locale = "uk-UA",
  className,
  ...props
}: Omit<AnimatedNumberProps, "formatOptions"> & {
  currency?: string;
}) {
  return (
    <AnimatedNumber
      value={value}
      locale={locale}
      formatOptions={{
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }}
      className={className}
      {...props}
    />
  );
});

/**
 * AnimatedPercent — specialized AnimatedNumber for percentages.
 */
export const AnimatedPercent = memo(function AnimatedPercent({
  value,
  decimals = 0,
  className,
  ...props
}: Omit<AnimatedNumberProps, "suffix">) {
  return (
    <AnimatedNumber
      value={value}
      decimals={decimals}
      suffix="%"
      className={className}
      {...props}
    />
  );
});
