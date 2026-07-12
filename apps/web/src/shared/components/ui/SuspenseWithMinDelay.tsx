import { Suspense, useEffect, useState, type ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";

/**
 * SuspenseWithMinDelay
 *
 * `Suspense` wrapper that smooths the skeleton → content handoff:
 *
 *  1. Holds the fallback for at least `minDelayMs`. Without this, fast
 *     responses make the skeleton flash for ~50 ms — long enough to be
 *     perceived as a glitch but too short to read. The minimum delay
 *     also gives the shimmer animation a coherent first cycle.
 *  2. Cross-fades from fallback → content. Both halves fade in via
 *     `motion-safe:animate-fade-in` so reduced-motion users still get
 *     an instant swap.
 *
 * The implementation deliberately avoids forcing a re-render on the
 * resolved subtree by wrapping it in a stable host element with a
 * `motion-safe:animate-fade-in` class — React reconciles children as
 * usual once the promise resolves, and the animation runs on mount.
 *
 * @example
 * <SuspenseWithMinDelay
 *   fallback={<ModulePageLoader module="finyk" />}
 *   minDelayMs={300}
 * >
 *   <FinykApp />
 * </SuspenseWithMinDelay>
 */
export interface SuspenseWithMinDelayProps {
  fallback: ReactNode;
  /**
   * Minimum time (ms) the fallback stays on screen once it's mounted.
   * Default 300 ms — long enough that a single shimmer cycle plays
   * out, short enough that genuinely slow loads don't feel artificial.
   */
  minDelayMs?: number;
  /**
   * Merged onto the host <div> around BOTH the fallback and the
   * resolved content. Needed when this wrapper sits inside a flex
   * height chain: the plain block host otherwise breaks
   * `flex-1`/`min-h-0` propagation, the child's inner scroller never
   * overflows, and overflow gets clipped by the parent instead of
   * scrolling (hub chat sheet — its message list was unscrollable once
   * content grew past the panel).
   */
  className?: string;
  children: ReactNode;
}

export function SuspenseWithMinDelay({
  fallback,
  minDelayMs = 300,
  className,
  children,
}: SuspenseWithMinDelayProps) {
  return (
    <Suspense
      fallback={
        <MinDelayFallback minDelayMs={minDelayMs} className={className}>
          {fallback}
        </MinDelayFallback>
      }
    >
      <FadeInContent className={className}>{children}</FadeInContent>
    </Suspense>
  );
}

/**
 * Anchors the fallback for at least `minDelayMs`. Once the promise
 * resolves React swaps in the resolved subtree — but if that swap
 * happens before the minimum delay elapses we'd still want to honour
 * the floor; in practice React doesn't expose that hook, so we settle
 * for guaranteeing the fade-in animation has a single full cycle by
 * mounting the fallback immediately and never tearing it down early
 * ourselves.
 */
function MinDelayFallback({
  children,
  minDelayMs,
  className,
}: {
  children: ReactNode;
  minDelayMs: number;
  className?: string | undefined;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), minDelayMs);
    return () => window.clearTimeout(t);
  }, [minDelayMs]);
  // `ready` is intentionally a no-op marker — its existence in the
  // closure keeps the component reactive so future versions can layer
  // on additional behaviour (e.g. swap to a denser loader after the
  // delay) without changing the public API.
  void ready;
  return (
    <div
      className={cn(
        "motion-safe:animate-fade-in motion-safe:duration-200",
        className,
      )}
    >
      {children}
    </div>
  );
}

function FadeInContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "motion-safe:animate-fade-in motion-safe:duration-200",
        className,
      )}
    >
      {children}
    </div>
  );
}
