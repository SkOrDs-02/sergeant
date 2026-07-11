/**
 * Last validated: 2026-05-18
 * Status: Active
 */
import { memo, useEffect, useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";

/**
 * Sergeant Design System — CounterReveal (P2 primitive)
 *
 * Animated numeric reveal for hero values (Routine completed/scheduled,
 * Nutrition kcal consumed, Finyk balance, etc.). Tweens from
 * `entranceFrom` (default 0) to `value` over `duration` ms via
 * `requestAnimationFrame` with an ease-out-cubic curve.
 *
 * Hard Rule #17 — single ambient motion:
 *   CounterReveal counts as the active motion slot on the screen it
 *   lives in. Don't pair it with another autoplaying animation on the
 *   same surface. Under `prefers-reduced-motion: reduce` we render
 *   the final value instantly — no tween, no flash.
 *
 * Format:
 *   - `format` callback wins if provided (custom currency, units, …).
 *   - Otherwise: `Intl.NumberFormat('uk-UA')` formats the integer part.
 *   - If `max` is set, renders `value / max` in a single span so the
 *     hero stat stays a single line.
 *
 * `value` re-renders restart the tween from the current display value
 * (not from `entranceFrom`) so live counters animate smoothly between
 * subsequent updates.
 *
 * `maxTone="hero-ink"` (default `"default"`) switches the `/ max` suffix
 * to the theme-invariant hero-ink tone for use inside a `prominence="hero"`
 * Card — the saturated hero gradient («Чорнило» v3.1 § 3) makes the
 * default `text-subtle` invisible. Leave the default in a plain/neutral
 * wrapper (e.g. the Storybook default demo).
 */

export interface CounterRevealProps {
  value: number;
  /** Starting value for the FIRST mount tween. Default 0. */
  entranceFrom?: number;
  /** Animation duration in ms. Default 800. */
  duration?: number;
  /** Optional custom formatter (overrides locale formatting). */
  format?: (value: number) => string;
  /** Optional upper bound — when set, renders `value / max`. */
  max?: number;
  /** Locale for default formatting. Default `uk-UA`. */
  locale?: string;
  className?: string;
  /** Tone for the `/ max` suffix — see doc block above. */
  maxTone?: "default" | "hero-ink";
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function defaultFormat(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    Math.round(n),
  );
}

export const CounterReveal = memo(function CounterReveal({
  value,
  entranceFrom = 0,
  duration = 800,
  format,
  max,
  locale = "uk-UA",
  className,
  maxTone = "default",
}: CounterRevealProps) {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const [displayValue, setDisplayValue] = useState(
    prefersReducedMotion ? value : entranceFrom,
  );
  const rafRef = useRef<number | null>(null);
  const lastValueRef = useRef(displayValue);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayValue(value);
      lastValueRef.current = value;
      return;
    }

    const startValue = lastValueRef.current;
    const endValue = value;
    if (startValue === endValue) return;

    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = easeOutCubic(progress);
      const current = startValue + (endValue - startValue) * eased;
      setDisplayValue(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        lastValueRef.current = endValue;
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastValueRef.current = endValue;
    };
  }, [value, duration, prefersReducedMotion]);

  const formatted = format
    ? format(displayValue)
    : defaultFormat(displayValue, locale);

  const maxFormatted =
    max !== undefined
      ? format
        ? format(max)
        : defaultFormat(max, locale)
      : null;

  return (
    <span className={cn("tabular-nums", className)}>
      {formatted}
      {maxFormatted !== null && (
        <span
          className={
            maxTone === "hero-ink" ? "text-hero-ink/60" : "text-subtle"
          }
        >
          {" "}
          / {maxFormatted}
        </span>
      )}
    </span>
  );
});
