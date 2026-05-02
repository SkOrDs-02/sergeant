import {
  memo,
  useRef,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
  type TouchEvent,
} from "react";
import { cn } from "@shared/lib/cn";
import { Icon } from "./Icon";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage";

const SWIPE_THRESHOLD = 60;
const MAX_SWIPE = 100;
const SWIPE_HINT_STORAGE_KEY = "sergeant:swipe_hint_shown";

export interface SwipeToActionProps {
  children?: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftLabel?: ReactNode;
  rightLabel?: ReactNode;
  leftColor?: string;
  rightColor?: string;
  disabled?: boolean;
  /** Show swipe hint for first-time users */
  showHint?: boolean;
  /** Custom hint text */
  hintText?: string;
}

function SwipeToActionImpl({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftLabel = "✓",
  rightLabel = "🗑",
  leftColor = "bg-success",
  rightColor = "bg-danger",
  disabled = false,
  showHint = false,
  hintText,
}: SwipeToActionProps) {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const isHorizontal = useRef<boolean | null>(null);
  // Synchronous guard against a second touchStart landing inside the 200ms
  // commit animation — setCommitted() is async, so we cannot read the state
  // back in onTouchStart to ignore the duplicate.
  const committingRef = useRef<boolean>(false);

  // Show hint for first-time users
  useEffect(() => {
    if (!showHint || disabled) return;
    const shown = safeReadLS(SWIPE_HINT_STORAGE_KEY);
    if (!shown) {
      // Show hint after a short delay
      const timer = setTimeout(() => {
        setHintVisible(true);
        // Auto-hide after 4 seconds
        setTimeout(() => setHintVisible(false), 4000);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [showHint, disabled]);

  // Mark hint as shown after first successful swipe
  const markHintShown = useCallback(() => {
    safeWriteLS(SWIPE_HINT_STORAGE_KEY, "true");
    setHintVisible(false);
  }, []);

  const reset = useCallback(() => {
    setOffset(0);
    setIsDragging(false);
    isHorizontal.current = null;
    startX.current = null;
    startY.current = null;
  }, []);

  const onTouchStart = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (disabled) return;
      // A previous swipe is still inside its 200ms commit animation. If we
      // accept a new touch now the commit timeout will fire twice (same
      // action, same row) — a real regression reported by users on fast
      // double-swipes of list items.
      if (committingRef.current) return;
      // Multi-touch (pinch-zoom, two-finger scroll) should never be
      // interpreted as a horizontal swipe — ignore entirely.
      if (e.touches.length !== 1) return;
      setCommitted(false);
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      isHorizontal.current = null;
      setIsDragging(true);
    },
    [disabled],
  );

  const onTouchMove = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (!isDragging || startX.current === null || startY.current === null)
        return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;

      if (isHorizontal.current === null) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        isHorizontal.current = Math.abs(dx) > Math.abs(dy);
      }

      if (!isHorizontal.current) {
        setIsDragging(false);
        return;
      }

      e.preventDefault();
      const clamped = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, dx));
      if (clamped < 0 && !onSwipeLeft) return;
      if (clamped > 0 && !onSwipeRight) return;
      setOffset(clamped);
    },
    [isDragging, onSwipeLeft, onSwipeRight],
  );

  const onTouchEnd = useCallback(() => {
    if (!isDragging) return;
    if (offset < -SWIPE_THRESHOLD && onSwipeLeft) {
      setCommitted(true);
      committingRef.current = true;
      markHintShown();
      setTimeout(() => {
        onSwipeLeft();
        reset();
        setCommitted(false);
        committingRef.current = false;
      }, 200);
    } else if (offset > SWIPE_THRESHOLD && onSwipeRight) {
      setCommitted(true);
      committingRef.current = true;
      markHintShown();
      setTimeout(() => {
        onSwipeRight();
        reset();
        setCommitted(false);
        committingRef.current = false;
      }, 200);
    } else {
      reset();
    }
    setIsDragging(false);
  }, [isDragging, offset, onSwipeLeft, onSwipeRight, reset, markHintShown]);

  const onTouchCancel = useCallback(() => {
    // System cancel (iOS bounce / app switcher / pinch) — abandon the drag
    // without firing the action. Without this handler the row would stay
    // translated until the next touch.
    if (committingRef.current) return;
    reset();
  }, [reset]);

  const showLeft = offset < 0 && onSwipeLeft;
  const showRight = offset > 0 && onSwipeRight;

  const defaultHintText = onSwipeLeft
    ? "Свайпни вліво для дії"
    : onSwipeRight
      ? "Свайпни вправо для дії"
      : "Свайпни для дії";

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* First-time swipe hint */}
      {hintVisible && (
        <div
          className={cn(
            "absolute inset-x-0 -top-8 z-10 flex items-center justify-center gap-1.5",
            "text-xs text-muted",
            "motion-safe:animate-fade-in",
          )}
        >
          <Icon
            name="arrow-left"
            size={12}
            className="motion-safe:animate-pulse"
          />
          <span>{hintText || defaultHintText}</span>
        </div>
      )}
      {showLeft && (
        <div
          className={cn(
            "absolute inset-y-0 right-0 flex items-center justify-center px-5 text-white font-semibold text-sm",
            rightColor,
          )}
          style={{ width: Math.abs(offset) }}
          aria-hidden
        >
          <span
            className={cn(
              "transition-opacity",
              Math.abs(offset) > SWIPE_THRESHOLD ? "opacity-100" : "opacity-60",
            )}
          >
            {rightLabel}
          </span>
        </div>
      )}
      {showRight && (
        <div
          className={cn(
            "absolute inset-y-0 left-0 flex items-center justify-center px-5 text-white font-semibold text-sm",
            leftColor,
          )}
          style={{ width: Math.abs(offset) }}
          aria-hidden
        >
          <span
            className={cn(
              "transition-opacity",
              Math.abs(offset) > SWIPE_THRESHOLD ? "opacity-100" : "opacity-60",
            )}
          >
            {leftLabel}
          </span>
        </div>
      )}
      <div
        style={{
          transform: `translateX(${committed ? (offset < 0 ? -MAX_SWIPE * 2 : MAX_SWIPE * 2) : offset}px)`,
          transition:
            isDragging && !committed ? "none" : "transform 0.2s ease-out",
          willChange: "transform",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
        {children}
      </div>
    </div>
  );
}

export const SwipeToAction = memo(SwipeToActionImpl);
