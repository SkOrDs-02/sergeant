import { useEffect, useRef, useState, memo } from "react";
import { cn } from "../../lib/ui/cn";

interface AnimatedNumberProps {
  value: number;
  /** Number of decimal places. Default 0. */
  decimals?: number | undefined;
  /** Animation duration in ms. Default 600. */
  duration?: number | undefined;
  /** Locale for formatting. Default "uk-UA". */
  locale?: string | undefined;
  /** Intl.NumberFormat options for currency, units, etc. */
  formatOptions?: Intl.NumberFormatOptions | undefined;
  /** Custom formatter function (overrides locale/formatOptions). */
  formatter?: ((value: number) => string) | undefined;
  /** Additional CSS classes. */
  className?: string | undefined;
  /** Prefix (e.g., currency symbol). */
  prefix?: string | undefined;
  /** Suffix (e.g., unit). */
  suffix?: string | undefined;
  /** Disable animation and show value immediately. */
  immediate?: boolean | undefined;
  /**
   * R2-V-11 · Odometer mode. Instead of a count-up that re-renders the
   * whole formatted string each frame, each glyph becomes a vertical reel
   * that rolls to its target digit. Best for large "hero" totals where the
   * mechanical roll reads as a counter. Non-digit glyphs (spaces, group
   * separators, currency symbols) render statically. Falls back to a
   * static value under `prefers-reduced-motion` or `immediate`.
   */
  odometer?: boolean | undefined;
}

/** Row height of one odometer reel, in `em` (relative to font-size). */
const REEL_HEIGHT_EM = 1.1;

/**
 * A single vertical digit reel (0-9) translated to show `digit`. Shared by
 * the odometer render path. Kept module-private — call sites use
 * `<AnimatedNumber odometer />`.
 */
const DigitReel = memo(function DigitReel({
  digit,
  reduced,
  duration,
}: {
  digit: number;
  reduced: boolean;
  duration: number;
}) {
  return (
    <span
      className="relative inline-block w-[0.62em] overflow-hidden align-baseline tabular-nums"
      style={{ height: `${REEL_HEIGHT_EM}em` }}
      aria-hidden="true"
    >
      <span
        className="absolute left-0 top-0 flex flex-col"
        style={{
          transform: `translateY(-${digit * 10}%)`,
          transition: reduced
            ? undefined
            : `transform ${duration}ms cubic-bezier(0.22,1,0.36,1)`,
        }}
      >
        {Array.from({ length: 10 }).map((_, n) => (
          <span
            key={n}
            className="flex items-center justify-center leading-none"
            style={{ height: `${REEL_HEIGHT_EM}em` }}
          >
            {n}
          </span>
        ))}
      </span>
    </span>
  );
});

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
  odometer = false,
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

  const format = (n: number) =>
    formatter
      ? formatter(n)
      : new Intl.NumberFormat(locale, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
          ...formatOptions,
        }).format(n);

  // Odometer path: roll each digit glyph of the *target* value directly.
  // The reels animate via CSS transform, so we skip the per-frame RAF
  // count-up entirely (no `displayValue`) — the DOM stays cheap and the
  // motion is GPU-composited. Screen readers get the full value via an
  // `aria-label`; the reels themselves are `aria-hidden`.
  if (odometer) {
    const rolled = format(value);
    const skipMotion = immediate || prefersReducedMotion;
    return (
      <span
        className={cn("tabular-nums inline-flex items-baseline", className)}
        role="img"
        aria-label={`${prefix}${rolled}${suffix}`}
      >
        {prefix && <span aria-hidden="true">{prefix}</span>}
        {rolled.split("").map((ch, i) =>
          ch >= "0" && ch <= "9" ? (
            <DigitReel
              key={i}
              digit={Number(ch)}
              reduced={skipMotion}
              duration={duration}
            />
          ) : (
            <span key={i} aria-hidden="true">
              {ch}
            </span>
          ),
        )}
        {suffix && <span aria-hidden="true">{suffix}</span>}
      </span>
    );
  }

  return (
    <span className={cn("tabular-nums", className)}>
      {prefix}
      {format(displayValue)}
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
