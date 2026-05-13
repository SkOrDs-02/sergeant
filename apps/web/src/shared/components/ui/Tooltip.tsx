import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/ui/cn";
import {
  computeFloatingPosition,
  type FloatingPlacementInput,
} from "./floatingPosition";

/**
 * Sergeant Design System — Tooltip
 *
 * Accessible, controlled-ish tooltip that replaces the drift-prone
 * `title="..."` native-HTML tooltip pattern.
 *
 * - Opens on `mouseenter` / `focusin` (focus-visible) of the trigger
 *   after a short `openDelay` (defaults to 150 ms — long enough to
 *   avoid flicker when moving through a toolbar, short enough to
 *   feel responsive).
 * - Closes on `mouseleave` / `focusout` / `Escape` / outside-click.
 * - Aria-wired: the floating panel owns `role="tooltip"` + a stable
 *   `id`; the trigger receives `aria-describedby` pointing to that id.
 * - `motion-safe:` on the fade-in respects
 *   `prefers-reduced-motion: reduce` (Hard Rule #17 / animation budget).
 * - Portaled to `document.body` so the panel escapes transformed /
 *   `overflow: hidden` ancestors — same precedent as the Modal /
 *   `WeeklyDigestStories` fix (PR #2227).
 *
 * API:
 * - `content` — the tooltip body (string or JSX).
 * - `children` — a **single** React element that becomes the trigger.
 *   Must forward `onMouseEnter` / `onMouseLeave` / `onFocus` / `onBlur`
 *   / `aria-describedby` handlers through to its rendered DOM node.
 *   Native `<button>`, `<a>`, and Sergeant primitives (Button,
 *   IconButton, Badge) all satisfy this out of the box.
 * - `placement` — 12-direction grid: `top|right|bottom|left` +
 *   `*-start|*-end`. Legacy aliases (`top-center`, …) are accepted
 *   and normalised internally.
 * - `size` — `sm` (default, compact caption) or `md` (multi-line copy).
 * - `openDelay` — ms before showing (default 150 ms).
 * - `disabled` — suppress opening entirely (still renders the trigger).
 *
 * Limitations (by design):
 * - Not a focus-trap. Tooltip is **non-interactive** content; clickable
 *   bodies should use Popover instead.
 * - No automatic flip — if a tooltip is partially obscured, swap
 *   `placement` in the call-site. We clamp to the viewport so the
 *   panel never bleeds off-screen on narrow widths / rotation.
 */

export type TooltipPlacement = FloatingPlacementInput;

export type TooltipSize = "sm" | "md";

const sizeClasses: Record<TooltipSize, string> = {
  sm: "text-style-caption px-2 py-1 max-w-[16rem]",
  md: "text-style-body px-3 py-2 max-w-[20rem] leading-snug",
};

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  placement?: TooltipPlacement;
  size?: TooltipSize;
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
  placement = "top",
  size = "sm",
  openDelay = 150,
  disabled = false,
  className,
  wrapperClassName,
}: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
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

  // Measure trigger + panel and place the panel after layout. We use
  // a layout effect so the user never sees a one-frame flash at (0,0)
  // before reposition.
  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const trigger = wrapperRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const tRect = trigger.getBoundingClientRect();
    const pRect = panel.getBoundingClientRect();
    const pos = computeFloatingPosition(
      {
        top: tRect.top,
        left: tRect.left,
        width: tRect.width,
        height: tRect.height,
      },
      { width: pRect.width, height: pRect.height },
      placement,
    );
    setCoords({ top: pos.top, left: pos.left });
  }, [open, placement, content]);

  // Reposition on scroll / resize so the tooltip tracks its trigger
  // when the page reflows underneath an open tooltip.
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const trigger = wrapperRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const tRect = trigger.getBoundingClientRect();
      const pRect = panel.getBoundingClientRect();
      const pos = computeFloatingPosition(
        {
          top: tRect.top,
          left: tRect.left,
          width: tRect.width,
          height: tRect.height,
        },
        { width: pRect.width, height: pRect.height },
        placement,
      );
      setCoords({ top: pos.top, left: pos.left });
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, placement]);

  // Outside-click closes the tooltip — guards against a tap on the
  // trigger that briefly held focus and then lost it without
  // triggering blur (some touch keyboards on iOS).
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (wrapperRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      closeNow();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, closeNow]);

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

  // Render the panel into document.body so any transformed /
  // overflow:hidden ancestor cannot clip or re-anchor it. Mirrors
  // the Modal portal pattern (apps/web/src/shared/components/ui/Modal.tsx)
  // which fixed the same class of containing-block bugs in PR #2227.
  const portal =
    open && typeof document !== "undefined"
      ? createPortal(
          <span
            ref={panelRef}
            id={id}
            role="tooltip"
            style={{
              position: "fixed",
              // Before the first measurement we park the panel off-
              // screen instead of toggling `visibility: hidden` so the
              // accessibility tree (and tests / screen-readers) still
              // sees it as `role="tooltip"`. `useLayoutEffect` runs
              // synchronously before paint, so the user never sees the
              // off-screen placeholder coordinates.
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              zIndex: 1000,
              pointerEvents: "none",
            }}
            className={cn(
              "rounded-xl bg-fg text-surface shadow-float",
              "motion-safe:animate-fade-in",
              sizeClasses[size],
              className,
            )}
          >
            {content}
          </span>,
          document.body,
        )
      : null;

  return (
    <span ref={wrapperRef} className={cn("inline-flex", wrapperClassName)}>
      {trigger}
      {portal}
    </span>
  );
}
