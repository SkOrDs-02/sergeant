import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System — Tooltip
 *
 * Accessible, controlled-ish tooltip that replaces the drift-prone
 * `title=\"...\"` native-HTML tooltip pattern. Features:
 *
 * - Opens on `mouseenter` / `focusin` of the trigger after a short
 *   `openDelay` (defaults to 150 ms — long enough to avoid flicker when
 *   moving through a toolbar, short enough to feel responsive).
 * - Closes on `mouseleave` / `focusout` / `Escape`.
 * - Aria-wired: the floating panel owns `role=\"tooltip\"` + a stable
 *   `id`; the trigger receives `aria-describedby` pointing to that id.
 * - `motion-safe:` on the fade-in — respects
 *   `prefers-reduced-motion: reduce` per AGENTS rule 10.
 * - Portal-free: renders as a sibling with `absolute` positioning; the
 *   wrapper is `relative inline-flex` so the tooltip aligns with its
 *   trigger without layout shift.
 *
 * API:
 * - `content` — the tooltip body (string or JSX).
 * - `children` — a **single** React element that becomes the trigger.
 *   Must forward `onMouseEnter` / `onMouseLeave` / `onFocus` / `onBlur`
 *   / `aria-describedby` handlers through to its rendered DOM node.
 *   Native `<button>`, `<a>`, and Sergeant primitives (Button,
 *   IconButton, Badge) all satisfy this out of the box.
 * - `placement` — same four-corner grid as Popover (default
 *   `\"top-center\"`).
 * - `openDelay` — ms before showing (default 150 ms).
 * - `disabled` — suppress opening entirely (still renders the trigger).
 *
 * Limitations (by design):
 * - Not a focus-trap. Tooltip is non-interactive content; clickable
 *   bodies should use Popover instead.
 * - No collision detection — if a tooltip would clip viewport edges,
 *   swap `placement` in the call-site.
 */

export type TooltipPlacement =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-center"
  | "bottom-center"
  | "left-center"
  | "right-center";

const placementClasses: Record<TooltipPlacement, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
  "top-center": "bottom-full left-1/2 -translate-x-1/2 mb-2",
  "bottom-center": "top-full left-1/2 -translate-x-1/2 mt-2",
  "left-center": "right-full top-1/2 -translate-y-1/2 mr-2",
  "right-center": "left-full top-1/2 -translate-y-1/2 ml-2",
};

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  placement?: TooltipPlacement;
  openDelay?: number;
  disabled?: boolean;
  className?: string;
  wrapperClassName?: string;
}

interface TriggerExtraProps {
  "aria-describedby"?: string;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
  onKeyDown?: (e: ReactKeyboardEvent) => void;
}

export function Tooltip({
  content,
  children,
  placement = "top-center",
  openDelay = 150,
  disabled = false,
  className,
  wrapperClassName,
}: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const scheduleOpen = useCallback(() => {
    if (disabled) return;
    clearTimer();
    timerRef.current = setTimeout(() => setOpen(true), openDelay);
  }, [clearTimer, disabled, openDelay]);

  const closeNow = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  const triggerProps = children.props as TriggerExtraProps;

  const trigger = cloneElement(children, {
    "aria-describedby": open ? id : triggerProps["aria-describedby"],
    onMouseEnter: (e: React.MouseEvent) => {
      triggerProps.onMouseEnter?.(e);
      scheduleOpen();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      triggerProps.onMouseLeave?.(e);
      closeNow();
    },
    onFocus: (e: React.FocusEvent) => {
      triggerProps.onFocus?.(e);
      scheduleOpen();
    },
    onBlur: (e: React.FocusEvent) => {
      triggerProps.onBlur?.(e);
      closeNow();
    },
    onKeyDown: (e: ReactKeyboardEvent) => {
      triggerProps.onKeyDown?.(e);
      if (e.key === "Escape" && open) {
        closeNow();
      }
    },
  } as TriggerExtraProps);

  return (
    <span
      className={cn("relative inline-flex", wrapperClassName)}
      onMouseLeave={closeNow}
    >
      {trigger}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "text-style-caption absolute z-50 whitespace-nowrap rounded-xl bg-fg px-2 py-1 text-surface shadow-float",
            "motion-safe:animate-fade-in",
            placementClasses[placement],
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
