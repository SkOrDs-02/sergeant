/**
 * DropdownMenu — row primitives.
 *
 * Split out of `DropdownMenu.tsx` to honour the 600-LOC module-size
 * discipline (Hard Rule #18). Contains the visual `DropdownMenuEntryView`
 * (item / submenu / separator / label) plus the one-level submenu panel.
 *
 * Status: Active. Last validated: 2026-05-13 by @Skords-01 / Devin.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import type {
  DropdownMenuEntry,
  DropdownMenuItem,
  DropdownMenuSubmenuEntry,
} from "./DropdownMenu";

export interface DropdownMenuEntryViewProps {
  entry: DropdownMenuEntry;
  index: number;
  focused: boolean;
  openSubmenuId: string | null;
  onHoverIndex: (index: number) => void;
  onActivate: (item: DropdownMenuItem) => void;
  onOpenSubmenu: (id: string) => void;
  onCloseAll: () => void;
}

export function DropdownMenuEntryView({
  entry,
  index,
  focused,
  openSubmenuId,
  onHoverIndex,
  onActivate,
  onOpenSubmenu,
  onCloseAll,
}: DropdownMenuEntryViewProps) {
  if (entry.type === "separator") {
    return <hr aria-orientation="horizontal" className="my-1 border-line" />;
  }
  if (entry.type === "label") {
    return (
      <div
        role="presentation"
        // eslint-disable-next-line sergeant-design/no-eyebrow-drift -- intentional group-header eyebrow inside DropdownMenu; SectionHeading is overkill here.
        className="px-3 pt-2 pb-1 text-2xs uppercase tracking-wide font-semibold text-subtle"
      >
        {entry.label}
      </div>
    );
  }
  const isSubmenu = entry.type === "submenu";
  const isSubmenuOpen = isSubmenu && openSubmenuId === entry.id;
  return (
    <div className="relative">
      <button
        type="button"
        role="menuitem"
        aria-haspopup={isSubmenu ? "menu" : undefined}
        aria-expanded={isSubmenu ? isSubmenuOpen : undefined}
        aria-disabled={entry.disabled || undefined}
        data-menu-index={index}
        tabIndex={focused ? 0 : -1}
        disabled={entry.disabled}
        onMouseEnter={() => !entry.disabled && onHoverIndex(index)}
        onFocus={() => onHoverIndex(index)}
        onClick={() => {
          if (entry.disabled) return;
          if (entry.type === "item") onActivate(entry);
          else if (entry.type === "submenu") onOpenSubmenu(entry.id);
        }}
        className={cn(
          "flex w-full items-center gap-2.5 px-3 py-2 text-left",
          "transition-colors duration-150 rounded-xl",
          "outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
          "focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
          // Highlight is data-driven from focusedIndex so keyboard nav
          // and pointer hover share the same active state.
          focused && !entry.disabled && "bg-panelHi",
          entry.type === "item" && entry.destructive
            ? "text-danger"
            : "text-text",
          entry.disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        {entry.icon ? (
          <span className="shrink-0 w-4 h-4 flex items-center justify-center text-muted">
            {entry.icon}
          </span>
        ) : null}
        <span className="flex-1 min-w-0">
          <span className="block text-sm truncate">{entry.label}</span>
          {entry.description ? (
            <span className="block text-xs text-muted truncate">
              {entry.description}
            </span>
          ) : null}
        </span>
        {entry.type === "item" && entry.shortcut ? (
          <kbd
            className={cn(
              "shrink-0 ml-2 inline-flex items-center px-1.5 h-5",
              "text-2xs font-mono font-semibold text-muted",
              "bg-surface-muted border border-line rounded-md",
            )}
          >
            {entry.shortcut}
          </kbd>
        ) : null}
        {isSubmenu ? (
          <span aria-hidden="true" className="shrink-0 ml-2 text-muted text-xs">
            ▸
          </span>
        ) : null}
      </button>
      {isSubmenuOpen && entry.type === "submenu" ? (
        <DropdownMenuSubmenuPanel entry={entry} onClose={onCloseAll} />
      ) : null}
    </div>
  );
}

interface SubmenuPanelProps {
  entry: DropdownMenuSubmenuEntry;
  onClose: () => void;
}

function DropdownMenuSubmenuPanel({ entry, onClose }: SubmenuPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const focusable = useMemo(
    () =>
      entry.items.filter(
        (e): e is DropdownMenuItem =>
          e.type === "item" && !(e as DropdownMenuItem).disabled,
      ),
    [entry.items],
  );
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const btn = ref.current?.querySelector<HTMLElement>(
      `[data-submenu-index="${idx}"]`,
    );
    btn?.focus();
  }, [idx]);

  const visibleCount = Math.max(focusable.length, 1);

  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      aria-label={typeof entry.label === "string" ? entry.label : undefined}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setIdx((i) => (i + 1) % visibleCount);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          setIdx((i) => (i - 1 + visibleCount) % visibleCount);
        } else if (event.key === "Home") {
          event.preventDefault();
          setIdx(0);
        } else if (event.key === "End") {
          event.preventDefault();
          setIdx(Math.max(visibleCount - 1, 0));
        }
        // Escape / ArrowLeft are handled by the parent menu via bubbling.
      }}
      className={cn(
        "absolute top-0 left-full ml-1 min-w-[180px] py-1.5",
        "bg-panel border border-line rounded-2xl shadow-float",
        "motion-safe:animate-fade-in outline-none",
      )}
    >
      {entry.items.map((sub, i) => {
        if (sub.type === "separator") {
          return (
            <hr
              key={sub.id ?? `sep-${i}`}
              aria-orientation="horizontal"
              className="my-1 border-line"
            />
          );
        }
        const itemIdx = focusable.findIndex((f) => f.id === sub.id);
        return (
          <button
            key={sub.id}
            type="button"
            role="menuitem"
            aria-disabled={sub.disabled || undefined}
            disabled={sub.disabled}
            data-submenu-index={itemIdx}
            tabIndex={itemIdx === idx ? 0 : -1}
            onClick={() => {
              if (sub.disabled) return;
              sub.onSelect?.();
              onClose();
            }}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm",
              "transition-colors duration-150 rounded-xl",
              "outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
              "focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
              "hover:bg-panelHi focus-visible:bg-panelHi",
              sub.destructive ? "text-danger" : "text-text",
              sub.disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {sub.icon ? (
              <span className="shrink-0 w-4 h-4 flex items-center justify-center text-muted">
                {sub.icon}
              </span>
            ) : null}
            <span className="flex-1 min-w-0 truncate">{sub.label}</span>
            {sub.shortcut ? (
              <kbd
                className={cn(
                  "shrink-0 ml-2 inline-flex items-center px-1.5 h-5",
                  "text-2xs font-mono font-semibold text-muted",
                  "bg-surface-muted border border-line rounded-md",
                )}
              >
                {sub.shortcut}
              </kbd>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
