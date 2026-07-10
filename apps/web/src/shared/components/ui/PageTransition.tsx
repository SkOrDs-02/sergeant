import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { cn } from "../../lib/ui/cn";

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

  // Incremented (render-time state update) each time a reduced-motion swap
  // fires. The effect below watches this counter to call onTransitionEnd.
  // Using a counter rather than a ref avoids the react-hooks/refs lint rule
  // (no ref mutations during render) while keeping the effect flushed
  // synchronously by RTL's act().
  const [reducedMotionSwapSeq, setReducedMotionSwapSeq] = useState(0);

  const [prevPageKey, setPrevPageKey] = useState(pageKey);
  if (pageKey === displayedKey && isExiting) {
    setIsExiting(false);
    setPrevPageKey(pageKey);
  } else if (pageKey !== displayedKey && pageKey !== prevPageKey) {
    setPrevPageKey(pageKey);
    if (prefersReducedMotion) {
      setDisplayedKey(pageKey);
      setDisplayedChildren(children);
      setReducedMotionSwapSeq((s) => s + 1);
    } else {
      setIsExiting(true);
    }
  }

  // Fire onTransitionEnd after a reduced-motion swap. Mutating the ref is
  // safe here (inside an effect, not during render).
  const prevReducedMotionSwapSeqRef = useRef(0);
  useEffect(() => {
    if (reducedMotionSwapSeq === prevReducedMotionSwapSeqRef.current) return;
    prevReducedMotionSwapSeqRef.current = reducedMotionSwapSeq;
    onTransitionEnd?.();
  }, [reducedMotionSwapSeq, onTransitionEnd]);

  useLayoutEffect(() => {
    if (pageKey !== displayedKey) return;
    if (!timeoutRef.current) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = undefined;
  }, [pageKey, displayedKey]);

  useEffect(() => {
    if (!isExiting || pageKey === displayedKey) return;

    timeoutRef.current = setTimeout(() => {
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
  }, [isExiting, pageKey, displayedKey, children, duration, onTransitionEnd]);

  if (
    pageKey === displayedKey &&
    !isExiting &&
    displayedChildren !== children
  ) {
    setDisplayedChildren(children);
  }

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
