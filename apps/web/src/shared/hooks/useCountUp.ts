import { useState, useEffect, useRef, useCallback } from "react";

interface UseCountUpOptions {
  /** Duration of animation in ms. Default 600. */
  duration?: number;
  /** Easing function. Default "easeOutCubic". */
  easing?: "linear" | "easeOutCubic" | "easeOutExpo";
  /** Number of decimal places. Default 0. */
  decimals?: number;
  /** Start animation immediately. Default true. */
  autoStart?: boolean;
  /** Delay before starting in ms. Default 0. */
  delay?: number;
  /** Callback when animation completes. */
  onComplete?: () => void;
}

const easings = {
  linear: (t: number) => t,
  easeOutCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  easeOutExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};

/**
 * Animate a number from 0 (or previous value) to target value.
 * Respects prefers-reduced-motion.
 */
export function useCountUp(
  targetValue: number,
  options: UseCountUpOptions = {},
): {
  value: number;
  displayValue: string;
  isAnimating: boolean;
  start: () => void;
  reset: () => void;
} {
  const {
    duration = 600,
    easing = "easeOutCubic",
    decimals = 0,
    autoStart = true,
    delay = 0,
    onComplete,
  } = options;

  const [displayValue, setDisplayValue] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const startValueRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const delayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const animate = useCallback(() => {
    if (prefersReducedMotion) {
      setDisplayValue(targetValue);
      setIsAnimating(false);
      onComplete?.();
      return;
    }

    setIsAnimating(true);
    startValueRef.current = displayValue;
    startTimeRef.current = null;

    const step = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easings[easing](progress);

      const current =
        startValueRef.current +
        (targetValue - startValueRef.current) * easedProgress;
      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setDisplayValue(targetValue);
        setIsAnimating(false);
        onComplete?.();
      }
    };

    rafRef.current = requestAnimationFrame(step);
  }, [
    targetValue,
    duration,
    easing,
    displayValue,
    prefersReducedMotion,
    onComplete,
  ]);

  const start = useCallback(() => {
    if (delay > 0) {
      delayTimeoutRef.current = setTimeout(animate, delay);
    } else {
      animate();
    }
  }, [animate, delay]);

  const reset = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    if (delayTimeoutRef.current) {
      clearTimeout(delayTimeoutRef.current);
    }
    setDisplayValue(0);
    setIsAnimating(false);
  }, []);

  // Auto-start when target changes
  useEffect(() => {
    if (autoStart && targetValue !== displayValue) {
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetValue, autoStart]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (delayTimeoutRef.current) {
        clearTimeout(delayTimeoutRef.current);
      }
    };
  }, []);

  const formattedValue =
    decimals > 0
      ? displayValue.toFixed(decimals)
      : Math.round(displayValue).toString();

  return {
    value: displayValue,
    displayValue: formattedValue,
    isAnimating,
    start,
    reset,
  };
}

/**
 * Format a number with count-up animation and locale formatting.
 */
export function useFormattedCountUp(
  targetValue: number,
  options: UseCountUpOptions & {
    locale?: string;
    formatOptions?: Intl.NumberFormatOptions;
  } = {},
) {
  const { locale = "uk-UA", formatOptions, ...countUpOptions } = options;
  const { value, isAnimating, start, reset } = useCountUp(
    targetValue,
    countUpOptions,
  );

  const formattedValue = new Intl.NumberFormat(locale, formatOptions).format(
    Math.round(value),
  );

  return {
    value,
    displayValue: formattedValue,
    isAnimating,
    start,
    reset,
  };
}
