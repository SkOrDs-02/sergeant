import { useState, useEffect, useRef, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export type TransitionDirection =
  | "forward"
  | "backward"
  | "up"
  | "down"
  | "fade";

interface PageTransitionProps {
  /** The content to render */
  children: ReactNode;
  /** Unique key to trigger re-animation on change */
  pageKey: string;
  /** Animation direction */
  direction?: TransitionDirection;
  /** Animation duration in ms */
  duration?: number;
  /** Additional CSS classes */
  className?: string;
  /** Callback when transition completes */
  onTransitionEnd?: () => void;
}

const directionClasses: Record<
  TransitionDirection,
  { enter: string; exit: string }
> = {
  forward: {
    enter: "animate-slide-in-right",
    exit: "animate-slide-out-left",
  },
  backward: {
    enter: "animate-slide-in-left",
    exit: "animate-slide-out-right",
  },
  up: {
    enter: "animate-slide-in-up",
    exit: "animate-slide-out-down",
  },
  down: {
    enter: "animate-slide-in-down",
    exit: "animate-slide-out-up",
  },
  fade: {
    enter: "animate-fade-in",
    exit: "animate-fade-out",
  },
};

/**
 * PageTransition — wraps content with enter/exit animations.
 *
 * Usage:
 * ```tsx
 * <PageTransition pageKey={pathname} direction="forward">
 *   <MyPage />
 * </PageTransition>
 * ```
 */
export function PageTransition({
  children,
  pageKey,
  direction = "forward",
  duration = 240,
  className,
  onTransitionEnd,
}: PageTransitionProps) {
  const [displayedKey, setDisplayedKey] = useState(pageKey);
  const [displayedChildren, setDisplayedChildren] = useState(children);
  const [isExiting, setIsExiting] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Check for reduced motion preference
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (pageKey === displayedKey) return;

    if (prefersReducedMotion) {
      // Skip animation
      setDisplayedKey(pageKey);
      setDisplayedChildren(children);
      onTransitionEnd?.();
      return;
    }

    // Start exit animation
    setIsExiting(true);

    timeoutRef.current = setTimeout(() => {
      // After exit, update content and start enter animation
      setDisplayedKey(pageKey);
      setDisplayedChildren(children);
      setIsExiting(false);
      onTransitionEnd?.();
    }, duration);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [
    pageKey,
    displayedKey,
    children,
    duration,
    prefersReducedMotion,
    onTransitionEnd,
  ]);

  // Update children when key matches but content changes
  useEffect(() => {
    if (pageKey === displayedKey && !isExiting) {
      setDisplayedChildren(children);
    }
  }, [pageKey, displayedKey, children, isExiting]);

  const animClass = isExiting
    ? directionClasses[direction].exit
    : directionClasses[direction].enter;

  return (
    <div
      className={cn(
        "motion-safe:transition-opacity motion-safe:transition-transform",
        animClass,
        className,
      )}
      style={{ animationDuration: `${duration}ms` }}
    >
      {displayedChildren}
    </div>
  );
}

/**
 * CSS for PageTransition (add to animations.css):
 *
 * @keyframes slide-in-right {
 *   from { opacity: 0; transform: translateX(24px); }
 *   to { opacity: 1; transform: translateX(0); }
 * }
 * @keyframes slide-out-left {
 *   from { opacity: 1; transform: translateX(0); }
 *   to { opacity: 0; transform: translateX(-24px); }
 * }
 * .animate-slide-in-right { animation: slide-in-right 0.24s ease-out both; }
 * .animate-slide-out-left { animation: slide-out-left 0.24s ease-out both; }
 * // ... etc for other directions
 */
