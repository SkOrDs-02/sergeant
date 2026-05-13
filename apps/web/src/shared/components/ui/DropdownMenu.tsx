/**
 * Sergeant Design System — DropdownMenu
 *
 * Keyboard-first menu primitive: portal-mounted, full ARIA menu role,
 * arrow / Home / End / type-ahead / Escape / Enter / Space / Tab
 * handling, one-level sub-menus, separators, label group headers,
 * shortcut hints, description lines, destructive variant.
 *
 * Use for:
 *   - Action menus on a trigger button (kebab, profile menu, sort).
 *   - Lightweight command-like surfaces that don't need full search.
 *
 * For URL-addressable navigation, use `Tabs` / `Segmented`. For a
 * dialog-like confirmation, use `Modal`. For a global, searchable
 * action surface, use `CommandPalette`.
 *
 * Status: Active. Last validated: 2026-05-13 by @Skords-01 / Devin.
 */

import {
  cloneElement,
  forwardRef,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@shared/lib/ui/cn";
import {
  DropdownMenuEntryView,
  type DropdownMenuEntryViewProps,
} from "./DropdownMenu.entry";

export type DropdownMenuPlacement =
  | "bottom-start"
  | "bottom-end"
  | "top-start"
  | "top-end";

/** A clickable row inside the menu. */
export interface DropdownMenuItem {
  type: "item";
  id: string;
  label: ReactNode;
  /** Plain-text label used for type-ahead matching. */
  textValue?: string;
  /** Icon rendered to the left of the label. */
  icon?: ReactNode;
  /** Right-aligned secondary key hint (rendered inside <kbd>). */
  shortcut?: string;
  /** Optional second line under the label (muted text). */
  description?: ReactNode;
  /** Render with destructive-tone foreground. */
  destructive?: boolean;
  disabled?: boolean;
  /** Fired on Enter / Space / click. The menu closes after onSelect. */
  onSelect?: () => void;
}

/** A nested menu (one level deep). */
export interface DropdownMenuSubmenuEntry {
  type: "submenu";
  id: string;
  label: ReactNode;
  textValue?: string;
  icon?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  items: ReadonlyArray<DropdownMenuItem | DropdownMenuSeparator>;
}

/** A thin rule between groups. */
export interface DropdownMenuSeparator {
  type: "separator";
  id?: string;
}

/** A non-interactive group header. */
export interface DropdownMenuLabel {
  type: "label";
  id?: string;
  label: ReactNode;
}

export type DropdownMenuEntry =
  | DropdownMenuItem
  | DropdownMenuSubmenuEntry
  | DropdownMenuSeparator
  | DropdownMenuLabel;

interface TriggerInjectedProps {
  ref?: Ref<HTMLElement>;
  onClick?: (e: ReactMouseEvent<HTMLElement>) => void;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLElement>) => void;
  "aria-haspopup"?: "menu" | true;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
}

export interface DropdownMenuProps {
  /** A focusable React element (typically `<Button>`). We clone it to
   *  inject `aria-haspopup`, `aria-expanded`, `aria-controls`, `ref`,
   *  and click/keydown handlers — so the actual interactive element
   *  owns the ARIA contract and there's no extra `<div>` wrapper that
   *  screen readers can mis-route into. */
  trigger: ReactElement<TriggerInjectedProps>;
  items: ReadonlyArray<DropdownMenuEntry>;
  ariaLabel?: string;
  placement?: DropdownMenuPlacement;
  /** Width preset for the panel; defaults to `auto` (intrinsic). */
  width?: "auto" | "trigger" | number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  menuClassName?: string;
  /** Z-index for the panel. Defaults to 200 (matches `zIndex.modal`). */
  zIndex?: number;
}

export interface DropdownMenuHandle {
  open: () => void;
  close: () => void;
}

const TYPEAHEAD_RESET_MS = 500;

/** Extract a plain-text typeahead key. */
function entryTextValue(
  e: DropdownMenuItem | DropdownMenuSubmenuEntry,
): string {
  if (e.textValue) return e.textValue;
  if (typeof e.label === "string") return e.label;
  return "";
}

function isFocusableEntry(
  e: DropdownMenuEntry,
): e is DropdownMenuItem | DropdownMenuSubmenuEntry {
  return (e.type === "item" || e.type === "submenu") && !e.disabled;
}

/** Find the first non-disabled focusable entry index, optionally starting
 *  after `fromIndex` and moving in `direction`. Wraps. */
export function nextFocusableIndex(
  entries: ReadonlyArray<DropdownMenuEntry>,
  fromIndex: number,
  direction: 1 | -1,
): number {
  const n = entries.length;
  if (n === 0) return -1;
  for (let step = 1; step <= n; step += 1) {
    const idx = (((fromIndex + direction * step) % n) + n) % n;
    const entry = entries[idx];
    if (entry && isFocusableEntry(entry)) return idx;
  }
  return -1;
}

export const DropdownMenu = forwardRef<DropdownMenuHandle, DropdownMenuProps>(
  function DropdownMenu(
    {
      trigger,
      items,
      ariaLabel,
      placement = "bottom-start",
      width = "auto",
      open: controlledOpen,
      onOpenChange,
      menuClassName,
      zIndex = 200,
    },
    ref,
  ) {
    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;

    const triggerRef = useRef<HTMLElement>(null);
    const menuId = useId();

    const setOpen = useCallback(
      (next: boolean) => {
        if (!isControlled) setInternalOpen(next);
        onOpenChange?.(next);
      },
      [isControlled, onOpenChange],
    );

    useImperativeHandle(
      ref,
      () => ({ open: () => setOpen(true), close: () => setOpen(false) }),
      [setOpen],
    );

    const close = useCallback(
      (returnFocusToTrigger = true) => {
        setOpen(false);
        if (returnFocusToTrigger) {
          requestAnimationFrame(() => {
            triggerRef.current?.focus();
          });
        }
      },
      [setOpen],
    );

    if (!isValidElement(trigger)) {
      // Surface the mistake at runtime rather than silently swallowing
      // it — DropdownMenu's a11y contract depends on cloning the trigger.
      throw new Error(
        "DropdownMenu: `trigger` must be a single React element (e.g. <Button>…</Button>)",
      );
    }

    const existing = trigger.props as TriggerInjectedProps;
    const triggerEl = cloneElement(trigger, {
      ref: composeRefs(existing.ref, triggerRef),
      onClick: (event: ReactMouseEvent<HTMLElement>) => {
        existing.onClick?.(event);
        setOpen(!open);
      },
      onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
        existing.onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          event.preventDefault();
          setOpen(true);
        }
      },
      "aria-haspopup": "menu",
      "aria-expanded": open,
      "aria-controls": open ? menuId : undefined,
    });

    return (
      <>
        {triggerEl}
        {open ? (
          <DropdownMenuPanel
            anchorRef={triggerRef}
            id={menuId}
            ariaLabel={ariaLabel}
            items={items}
            placement={placement}
            width={width}
            zIndex={zIndex}
            menuClassName={menuClassName}
            onClose={close}
          />
        ) : null}
      </>
    );
  },
);

/** Compose an external (possibly-callback or null) ref with our internal one.
 *  Mirrors the pattern in react-aria — keeps cloneElement transparent. */
function composeRefs<T>(
  external: Ref<T> | undefined,
  internal: { current: T | null },
): (node: T | null) => void {
  return (node) => {
    internal.current = node;
    if (typeof external === "function") external(node);
    else if (external && typeof external === "object") {
      (external as { current: T | null }).current = node;
    }
  };
}

interface PanelProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  id: string;
  ariaLabel?: string;
  items: ReadonlyArray<DropdownMenuEntry>;
  placement: DropdownMenuPlacement;
  width: "auto" | "trigger" | number;
  zIndex: number;
  menuClassName?: string;
  onClose: (returnFocusToTrigger?: boolean) => void;
}

function DropdownMenuPanel({
  anchorRef,
  id,
  ariaLabel,
  items,
  placement,
  width,
  zIndex,
  menuClassName,
  onClose,
}: PanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const firstFocusable = useMemo(
    () => nextFocusableIndex(items, -1, 1),
    [items],
  );
  const [focusedIndex, setFocusedIndex] = useState<number>(firstFocusable);
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null);
  const typeaheadRef = useRef<{ buffer: string; lastAt: number }>({
    buffer: "",
    lastAt: 0,
  });

  // Position relative to the trigger; recompute on resize / scroll.
  const [position, setPosition] = useState<CSSProperties>({
    top: 0,
    left: 0,
    visibility: "hidden",
  });

  useEffect(() => {
    const update = () => {
      const a = anchorRef.current;
      const p = panelRef.current;
      if (!a || !p) return;
      const rect = a.getBoundingClientRect();
      const panelW = p.offsetWidth || 220;
      const panelH = p.offsetHeight || 0;
      let top = placement.startsWith("bottom")
        ? rect.bottom + 6
        : rect.top - panelH - 6;
      let left = placement.endsWith("start") ? rect.left : rect.right - panelW;
      const margin = 8;
      if (left < margin) left = margin;
      if (left + panelW > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - panelW - margin);
      }
      if (top < margin) top = margin;
      if (top + panelH > window.innerHeight - margin && panelH > 0) {
        top = Math.max(margin, window.innerHeight - panelH - margin);
      }
      const styles: CSSProperties = { top, left, visibility: "visible" };
      if (width === "trigger") styles.width = rect.width;
      else if (typeof width === "number") styles.width = width;
      setPosition(styles);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, placement, width]);

  // Focus the currently active menu item.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || openSubmenuId) return;
    const target = panel.querySelector<HTMLElement>(
      `[data-menu-index="${focusedIndex}"]`,
    );
    target?.focus({ preventScroll: false });
  }, [focusedIndex, openSubmenuId]);

  // Outside click closes.
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const t = event.target as Node | null;
      if (!t) return;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [anchorRef, onClose]);

  const activateItem = useCallback(
    (item: DropdownMenuItem) => {
      if (item.disabled) return;
      item.onSelect?.();
      onClose(true);
    },
    [onClose],
  );

  const handleTypeahead = useCallback(
    (ch: string) => {
      const now = Date.now();
      const state = typeaheadRef.current;
      if (now - state.lastAt > TYPEAHEAD_RESET_MS) state.buffer = "";
      state.buffer += ch.toLowerCase();
      state.lastAt = now;
      const buffer = state.buffer;
      const start = focusedIndex >= 0 ? focusedIndex + 1 : 0;
      for (let i = 0; i < items.length; i += 1) {
        const idx = (start + i) % items.length;
        const entry = items[idx];
        if (!entry || !isFocusableEntry(entry)) continue;
        const text = entryTextValue(entry).toLowerCase();
        if (text.startsWith(buffer)) {
          setFocusedIndex(idx);
          return;
        }
      }
    },
    [focusedIndex, items],
  );

  const onPanelKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const { key } = event;
      if (key === "Escape") {
        event.preventDefault();
        onClose(true);
        return;
      }
      if (key === "Tab") {
        // Tab closes and lets the browser advance focus naturally.
        onClose(false);
        return;
      }
      if (key === "ArrowDown") {
        event.preventDefault();
        setFocusedIndex((i) => nextFocusableIndex(items, i, 1));
        return;
      }
      if (key === "ArrowUp") {
        event.preventDefault();
        setFocusedIndex((i) => nextFocusableIndex(items, i, -1));
        return;
      }
      if (key === "Home") {
        event.preventDefault();
        setFocusedIndex(nextFocusableIndex(items, -1, 1));
        return;
      }
      if (key === "End") {
        event.preventDefault();
        setFocusedIndex(nextFocusableIndex(items, items.length, -1));
        return;
      }
      const focused = items[focusedIndex];
      if (key === "ArrowRight" && focused?.type === "submenu") {
        event.preventDefault();
        setOpenSubmenuId(focused.id);
        return;
      }
      if (key === "ArrowLeft" && openSubmenuId) {
        event.preventDefault();
        setOpenSubmenuId(null);
        return;
      }
      if (key === "Enter" || key === " ") {
        event.preventDefault();
        if (focused?.type === "item") activateItem(focused);
        else if (focused?.type === "submenu") setOpenSubmenuId(focused.id);
        return;
      }
      if (
        key.length === 1 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        handleTypeahead(key);
      }
    },
    [
      activateItem,
      focusedIndex,
      handleTypeahead,
      items,
      onClose,
      openSubmenuId,
    ],
  );

  const entryHandlers: Pick<
    DropdownMenuEntryViewProps,
    "onHoverIndex" | "onActivate" | "onOpenSubmenu" | "onCloseAll"
  > = {
    onHoverIndex: (i) => setFocusedIndex(i),
    onActivate: activateItem,
    onOpenSubmenu: (sid) => setOpenSubmenuId(sid),
    onCloseAll: () => onClose(true),
  };

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role="menu"
      aria-label={ariaLabel}
      tabIndex={-1}
      onKeyDown={onPanelKeyDown}
      className={cn(
        "fixed min-w-[200px] max-w-[320px] py-1.5",
        "bg-panel border border-line rounded-2xl shadow-float",
        "motion-safe:animate-fade-in outline-none",
        menuClassName,
      )}
      style={{ ...position, zIndex }}
    >
      {items.map((entry, index) => (
        <Fragment key={getEntryKey(entry, index)}>
          <DropdownMenuEntryView
            entry={entry}
            index={index}
            focused={focusedIndex === index}
            openSubmenuId={openSubmenuId}
            {...entryHandlers}
          />
        </Fragment>
      ))}
    </div>,
    document.body,
  );
}

function getEntryKey(entry: DropdownMenuEntry, index: number): string {
  if ("id" in entry && entry.id) return entry.id;
  return `entry-${index}`;
}
