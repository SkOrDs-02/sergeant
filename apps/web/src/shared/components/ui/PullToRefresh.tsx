import { useCallback, useRef, type ReactNode, type CSSProperties } from "react";
import { cn } from "@shared/lib/cn";
import {
  usePullToRefresh,
  type UsePullToRefreshOptions,
} from "@shared/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "./PullToRefreshIndicator";

export type PullToRefreshVariant = NonNullable<
  React.ComponentProps<typeof PullToRefreshIndicator>["variant"]
>;

export interface PullToRefreshProps {
  /** Called when the user finishes a successful pull gesture. */
  onRefresh: () => Promise<void> | void;
  /** Called when onRefresh throws. Use for error toasts / retry banners. */
  onError?: (err: unknown) => void;
  /** Module accent for the indicator ring. */
  variant?: PullToRefreshVariant;
  /** Disable the gesture (e.g. when offline or while a sheet is open). */
  enabled?: boolean;
  /** Render the outer (non-scrolling) wrapper as a different tag. */
  as?: "div" | "main";
  /** Pass-through to the outer wrapper. Useful for skip-link targets. */
  id?: string;
  tabIndex?: number;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** Extra classes for the outer wrapper. */
  className?: string;
  /** Extra classes for the inner scroll container. */
  contentClassName?: string;
  style?: CSSProperties;
  /**
   * Notified when the inner scroll element mounts/unmounts. Useful for
   * libraries like `react-virtuoso` that need a `customScrollParent`
   * element rather than a ref-object.
   */
  onScrollElement?: (el: HTMLDivElement | null) => void;
  children: ReactNode;
  /** Forward overrides to the underlying hook (rarely needed). */
  hookOptions?: Pick<
    UsePullToRefreshOptions,
    "pullThreshold" | "maxPullDistance" | "resistance"
  >;
}

/**
 * Wraps a scrollable region with the iOS-style pull-to-refresh gesture.
 * Renders a non-scrolling outer wrapper (so the indicator can float
 * above the content via `position: absolute`) and an inner scroll
 * container that owns the gesture.
 *
 * Usage:
 * ```tsx
 * <PullToRefresh onRefresh={mono.refresh} variant="finyk">
 *   <div className="max-w-4xl mx-auto px-4 pt-4">…</div>
 * </PullToRefresh>
 * ```
 *
 * For consumers using `react-virtuoso` (which needs a
 * `customScrollParent` element), pair with `onScrollElement`:
 * ```tsx
 * const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);
 * <PullToRefresh onScrollElement={setScrollParent} …>
 *   <Virtuoso customScrollParent={scrollParent ?? undefined} … />
 * </PullToRefresh>
 * ```
 */
export function PullToRefresh({
  onRefresh,
  onError,
  variant = "default",
  enabled = true,
  as = "div",
  id,
  tabIndex,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  className,
  contentClassName,
  style,
  onScrollElement,
  hookOptions,
  children,
}: PullToRefreshProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const setScrollEl = useCallback(
    (el: HTMLDivElement | null) => {
      scrollRef.current = el;
      onScrollElement?.(el);
    },
    [onScrollElement],
  );

  const handleRefresh = useCallback(async () => {
    await onRefresh();
  }, [onRefresh]);

  const state = usePullToRefresh({
    onRefresh: handleRefresh,
    onError,
    scrollRef,
    enabled,
    ...hookOptions,
  });

  const Tag = as;

  return (
    <Tag
      id={id}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={cn(
        "relative flex-1 flex flex-col min-h-0 outline-none",
        className,
      )}
      style={style}
    >
      <PullToRefreshIndicator state={state} variant={variant} />
      <div
        ref={setScrollEl}
        className={cn("flex-1 overflow-y-auto min-h-0", contentClassName)}
      >
        {children}
      </div>
    </Tag>
  );
}
