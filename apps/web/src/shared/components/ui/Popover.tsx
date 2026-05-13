import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/ui/cn";
import { useDialogFocusTrap } from "../../hooks/useDialogFocusTrap";
import {
  computeFloatingPosition,
  type FloatingPlacement,
} from "./floatingPosition";

/**
 * Sergeant Design System — Popover
 *
 * Click-triggered floating surface for menus, filters, info-cards and
 * contextual forms on desktop. On mobile (< md) prefer `Sheet`.
 *
 * Behaviour contract:
 * - Click-toggle with outside-click & `Escape` dismiss.
 * - Tab cycles inside the panel (`useDialogFocusTrap`); the first
 *   focusable child receives focus on open; focus is restored to the
 *   trigger when the panel closes.
 * - `aria-haspopup="true"`, `aria-expanded`, and `aria-controls` are
 *   wired on the trigger wrapper. When a `header` is supplied the
 *   panel also receives `aria-labelledby` pointing at the header.
 * - Portaled to `document.body` so the panel escapes transformed /
 *   `overflow: hidden` ancestors (same precedent as Modal — PR #2227).
 * - Placement: 12-direction grid (`top|right|bottom|left` +
 *   `*-start|*-end`). Default `bottom-start`.
 * - Optional `header` / `footer` slots — when present the panel uses
 *   `role="dialog"`; otherwise it keeps `role="menu"` for the
 *   PopoverItem / arrow-key navigation flow.
 *
 * For a menu use-case, compose with `PopoverItem` / `PopoverDivider`;
 * for an info-card or form-in-popover, pass arbitrary children with
 * optional `header` / `footer`.
 */

export type PopoverPlacement = FloatingPlacement;

export type PopoverRole = "menu" | "dialog";

const PANEL_OFFSET = 8;
const MIN_PANEL_WIDTH_PX = 200;

export interface PopoverProps {
  /** The trigger element. Wrapped in a `role="button"` host so the
   * Popover owns activation semantics. Pass non-interactive content
   * (e.g. `<span>`, `<Icon … />`, or a Sergeant `<Button>`). */
  trigger: ReactNode;
  /** Popover body. */
  children: ReactNode;
  /** Optional header slot — rendered above `children` and used for
   * `aria-labelledby` wiring. Forces `role="dialog"` unless
   * overridden via `role`. */
  header?: ReactNode;
  /** Optional footer slot (e.g. action buttons). */
  footer?: ReactNode;
  placement?: PopoverPlacement;
  /** Additional className on the floating panel. */
  className?: string;
  /** Additional className on the wrapper. */
  wrapperClassName?: string;
  /** Controlled open state. When provided, the popover becomes a
   * controlled component and `onOpenChange` must be wired up. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Accessible label for the panel when no `header` is present.
   * Maps to `aria-label`. */
  label?: string;
  /** Override the panel role. Defaults to `"dialog"` when `header` is
   * set, `"menu"` otherwise. */
  role?: PopoverRole;
}

export function Popover({
  trigger,
  children,
  header,
  footer,
  placement = "bottom-start",
  className,
  wrapperClassName,
  open: controlledOpen,
  onOpenChange,
  label,
  role,
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const headerId = useId();
  const prevOpenRef = useRef(open);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );

  const effectiveRole: PopoverRole = role ?? (header ? "dialog" : "menu");

  const setOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const value = typeof next === "function" ? next(open) : next;
      if (!isControlled) setInternalOpen(value);
      onOpenChange?.(value);
    },
    [open, isControlled, onOpenChange],
  );

  const close = useCallback(() => setOpen(false), [setOpen]);

  // Outside-click dismiss. Mousedown is intentional: matches existing
  // contract tests and avoids double-firing when the user releases
  // over a sibling element.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (wrapperRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, close]);

  // Focus-trap + Escape via the same hook the rest of the design system
  // uses for dialogs (Modal, Sheet). Tab cycles inside the panel; the
  // hook also restores focus to whatever was focused before open —
  // which in our case is the trigger wrapper because the user just
  // clicked it. We still keep the manual `triggerRef.current?.focus()`
  // below as a belt-and-braces fallback for the case where the
  // previously focused element has unmounted.
  useDialogFocusTrap(open, panelRef, { onEscape: close });

  // Focus first focusable child on open; restore focus to trigger on close.
  useEffect(() => {
    if (open && panelRef.current) {
      const focusable = panelRef.current.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      // Defer one microtask: the panel is just mounted and the
      // useDialogFocusTrap snapshot of `document.activeElement`
      // happens first — we want our focus call to win.
      Promise.resolve().then(() => focusable?.focus());
    } else if (prevOpenRef.current && !open) {
      triggerRef.current?.focus();
    }
    prevOpenRef.current = open;
  }, [open]);

  // Position the panel after layout so the first paint already has
  // the correct coordinates.
  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const trig = triggerRef.current;
    const panel = panelRef.current;
    if (!trig || !panel) return;
    const tRect = trig.getBoundingClientRect();
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
      PANEL_OFFSET,
    );
    setCoords({ top: pos.top, left: pos.left });
  }, [open, placement, children, header, footer]);

  // Track the page reflowing under an open popover (scroll, resize,
  // soft-keyboard show on iOS). Capture-phase scroll listener catches
  // scrolls inside any ancestor.
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const trig = triggerRef.current;
      const panel = panelRef.current;
      if (!trig || !panel) return;
      const tRect = trig.getBoundingClientRect();
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
        PANEL_OFFSET,
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

  const panel = open ? (
    <div
      ref={panelRef}
      id={panelId}
      role={effectiveRole}
      aria-labelledby={header ? headerId : undefined}
      aria-label={!header && label ? label : undefined}
      aria-modal={effectiveRole === "dialog" ? true : undefined}
      tabIndex={-1}
      style={{
        position: "fixed",
        // Before the first measurement we park the panel off-screen
        // (instead of toggling visibility:hidden) so the accessibility
        // tree still sees the role and aria-* wiring. `useLayoutEffect`
        // updates coords synchronously before paint — the user never
        // sees the off-screen placeholder.
        top: coords?.top ?? -9999,
        left: coords?.left ?? -9999,
        minWidth: MIN_PANEL_WIDTH_PX,
        zIndex: 1000,
      }}
      className={cn(
        "bg-panel border border-line rounded-2xl shadow-float",
        "motion-safe:animate-fade-in",
        // Default padding only when no header/footer; with slots the
        // sections own their own padding for tighter alignment.
        !header && !footer && "py-1.5",
        className,
      )}
      onKeyDown={(e) => {
        // Arrow-key roving focus for menu items (preserved from
        // original implementation — keeps PopoverItem keyboard UX).
        const items = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>(
            '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])',
          ) ?? [],
        );
        if (!items.length) return;
        const idx = items.indexOf(document.activeElement as HTMLElement);
        if (e.key === "ArrowDown") {
          e.preventDefault();
          items[(idx + 1) % items.length]?.focus();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          items[(idx - 1 + items.length) % items.length]?.focus();
        } else if (e.key === "Home") {
          e.preventDefault();
          items[0]?.focus();
        } else if (e.key === "End") {
          e.preventDefault();
          items[items.length - 1]?.focus();
        }
      }}
    >
      {header && (
        <div id={headerId} className="px-4 pt-3 pb-2 text-style-label text-fg">
          {header}
        </div>
      )}
      {header || footer ? (
        <div className="px-2 py-1.5">{children}</div>
      ) : (
        children
      )}
      {footer && (
        <div className="px-4 py-3 border-t border-line bg-surface-muted/40 rounded-b-2xl">
          {footer}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div
      ref={wrapperRef}
      className={cn("relative inline-block", wrapperClassName)}
    >
      <div
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        {trigger}
      </div>

      {panel && typeof document !== "undefined"
        ? createPortal(panel, document.body)
        : null}
    </div>
  );
}

/**
 * PopoverItem — Single action row inside a `Popover` menu. Use with
 * the default (`role="menu"`) panel; arrow-key navigation is wired by
 * the parent.
 */
export interface PopoverItemProps {
  children: ReactNode;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

export function PopoverItem({
  children,
  icon,
  destructive = false,
  disabled = false,
  onClick,
  className,
}: PopoverItemProps) {
  return (
    <button
      role="menuitem"
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-left",
        "transition-colors duration-150 rounded-xl mx-1 outline-none",
        "focus-visible:ring-2 focus-visible:ring-accent/60",
        destructive
          ? "text-danger hover:bg-danger-soft"
          : "text-text hover:bg-panelHi",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
    >
      {icon && (
        <span className="shrink-0 w-4 h-4 flex items-center justify-center text-muted">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}

/**
 * PopoverDivider — Thin horizontal rule between groups.
 */
export function PopoverDivider({ className }: { className?: string }) {
  return <hr className={cn("my-1.5 border-line", className)} />;
}
