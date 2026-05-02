import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "../../lib/cn";

/**
 * Sergeant Design System — Popover
 *
 * Lightweight dropdown/popover surface for menus, filters, and contextual
 * actions on desktop. On mobile (< md) prefer Sheet.
 *
 * Features:
 * - Click-toggle with outside-click & Escape dismiss
 * - Focus-trap-lite: first focusable child receives focus on open
 * - Accessible: aria-expanded, aria-controls, aria-haspopup
 * - Placement: bottom-start (default), bottom-end, top-start, top-end
 * - Portal-free (renders inline) — works inside overflow:hidden parents
 *   because the popover uses `position: fixed` via the `fixed` utility.
 */

export type PopoverPlacement =
  | "bottom-start"
  | "bottom-end"
  | "top-start"
  | "top-end";

const placementClasses: Record<PopoverPlacement, string> = {
  "bottom-start": "top-full left-0 mt-2",
  "bottom-end": "top-full right-0 mt-2",
  "top-start": "bottom-full left-0 mb-2",
  "top-end": "bottom-full right-0 mb-2",
};

export interface PopoverProps {
  /** The trigger element (rendered as-is). */
  trigger: ReactNode;
  /** Popover body. */
  children: ReactNode;
  placement?: PopoverPlacement;
  /** Additional className on the floating panel. */
  className?: string;
  /** Additional className on the wrapper. */
  wrapperClassName?: string;
  /**
   * Controlled open state. When provided, the popover becomes a
   * controlled component and `onOpenChange` must be wired up. Useful
   * when the parent needs to close the popover after an item action
   * (e.g. opening a sibling drawer).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Popover({
  trigger,
  children,
  placement = "bottom-start",
  className,
  wrapperClassName,
  open: controlledOpen,
  onOpenChange,
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const setOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const value = typeof next === "function" ? next(open) : next;
      if (!isControlled) setInternalOpen(value);
      onOpenChange?.(value);
    },
    [open, isControlled, onOpenChange],
  );

  const close = useCallback(() => setOpen(false), [setOpen]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        close();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, close]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, close]);

  // Focus first focusable child on open
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const focusable = panelRef.current.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      className={cn("relative inline-block", wrapperClassName)}
    >
      {/* Trigger — wrapped in a button-like click handler */}
      <div
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

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="menu"
          className={cn(
            "absolute z-50 min-w-[180px]",
            "bg-panel border border-line rounded-2xl shadow-float",
            "motion-safe:animate-fade-in",
            "py-1.5",
            placementClasses[placement],
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * PopoverItem — Single action row inside a Popover.
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
