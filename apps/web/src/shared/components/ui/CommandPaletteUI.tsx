/**
 * Sergeant Design System — CommandPalette (UI body)
 *
 * The portal-mounted modal surface for the ⌘K command palette: search
 * input, debounced filtering, grouped results, keyboard nav (Arrow /
 * Home / End / Enter / Esc), focus trap, and recent-command rendering.
 *
 * Split out of `CommandPalette.tsx` so this heavy subtree (portal,
 * focus-trap, list rendering, styles) ships as its own lazy chunk. The
 * lightweight Provider / Context / hotkey hook stay eager in the sibling
 * module; only this body is dynamically imported (gated behind the
 * palette `open` state) at the render site — keeping it out of the entry
 * chunk. See initiative 0017.
 *
 * Status: Active. Last validated: 2026-05-13 by @Skords-01 / Devin.
 */

import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@shared/lib/ui/cn";
import { logger } from "@shared/lib";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { Icon } from "./Icon";
import {
  CommandPaletteContext,
  type PaletteCommand,
} from "./CommandPalette.context";

const SEARCH_DEBOUNCE_MS = 80;

export function CommandPaletteUI() {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- CommandPaletteUI is always rendered inside CommandPalette provider
  const ctx = useContext(CommandPaletteContext)!;
  const { open, closePalette, recents, markRecent, revision } = ctx;
  const titleId = useId();
  const listId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useDialogFocusTrap(open, panelRef, {
    onEscape: closePalette,
    inertBackground: true,
  });

  // Reset state and focus on each open.
  useEffect(() => {
    if (!open) return;
    setRawQuery("");
    setQuery("");
    setActiveIndex(0);
    const handle = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(handle);
  }, [open]);

  // Debounce query updates.
  useEffect(() => {
    const t = window.setTimeout(
      () => setQuery(rawQuery.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [rawQuery]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const allCommands = useMemo(
    () => ctx.getAll(),
    // `revision` ticks when commands are registered / unregistered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, revision],
  );

  const groups = useMemo(
    () => buildGroups(allCommands, recents, query),
    [allCommands, recents, query],
  );
  const flat = useMemo(() => groups.flatMap((g) => g.commands), [groups]);

  // Clamp activeIndex when the visible list shrinks.
  useEffect(() => {
    setActiveIndex((i) =>
      flat.length === 0 ? 0 : Math.min(i, flat.length - 1),
    );
  }, [flat.length]);

  const activeId = flat[activeIndex]?.id;

  const activate = useCallback(
    (command: PaletteCommand) => {
      if (command.disabled) return;
      markRecent(command.id);
      // Close before invoking so `command.run` can dispatch focus moves
      // (e.g. navigate to a route) without fighting the trap.
      closePalette();
      try {
        command.run();
      } catch (err) {
        logger.warn("[CommandPalette] run() threw", err);
      }
    },
    [closePalette, markRecent],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      const key = event.key;
      if (key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) => (flat.length ? (i + 1) % flat.length : 0));
        return;
      }
      if (key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) =>
          flat.length ? (i - 1 + flat.length) % flat.length : 0,
        );
        return;
      }
      if (key === "Home") {
        event.preventDefault();
        setActiveIndex(0);
        return;
      }
      if (key === "End") {
        event.preventDefault();
        setActiveIndex(Math.max(flat.length - 1, 0));
        return;
      }
      if (key === "Enter") {
        event.preventDefault();
        const cmd = flat[activeIndex];
        if (cmd) activate(cmd);
      }
    },
    [activate, activeIndex, flat],
  );

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-200 flex items-start justify-center p-4 pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm motion-safe:animate-fade-in cursor-default"
        onClick={closePalette}
        aria-label="Закрити палітру команд"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        className={cn(
          "relative w-full max-w-xl max-h-[70vh] flex flex-col overflow-hidden",
          "bg-panel border border-line rounded-3xl shadow-float",
          "motion-safe:animate-fade-in",
        )}
      >
        <h2 id={titleId} className="sr-only">
          Палітра команд
        </h2>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
          <Icon name="search" size="md" className="text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={rawQuery}
            onChange={(e) => {
              setRawQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Знайди команду…"
            className={cn(
              "flex-1 bg-transparent outline-none border-none",
              "text-sm text-text placeholder:text-subtle",
              "focus-visible:outline-none",
            )}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={activeId ? `cmd-${activeId}` : undefined}
          />
          <kbd
            className={cn(
              "shrink-0 hidden sm:inline-flex items-center px-1.5 h-5",
              "text-style-caption font-mono font-semibold text-muted",
              "bg-surface-muted border border-line rounded-md",
            )}
          >
            Esc
          </kbd>
        </div>
        <div
          id={listId}
          role="listbox"
          aria-label="Доступні команди"
          className="flex-1 overflow-y-auto py-2"
        >
          {flat.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted">
              Нічого не знайдено
            </div>
          ) : (
            groups.map((group) => (
              <CommandGroup
                key={group.id}
                group={group}
                activeId={activeId}
                onHover={(id) => {
                  const idx = flat.findIndex((c) => c.id === id);
                  if (idx >= 0) setActiveIndex(idx);
                }}
                onActivate={activate}
              />
            ))
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-line text-style-caption text-muted">
          <span className="inline-flex items-center gap-1.5">
            <kbd className="inline-flex items-center px-1.5 h-4 font-mono font-semibold bg-surface-muted border border-line rounded-md">
              ↑↓
            </kbd>
            <span>навігація</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <kbd className="inline-flex items-center px-1.5 h-4 font-mono font-semibold bg-surface-muted border border-line rounded-md">
              ↵
            </kbd>
            <span>виконати</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <kbd className="inline-flex items-center px-1.5 h-4 font-mono font-semibold bg-surface-muted border border-line rounded-md">
              Esc
            </kbd>
            <span>закрити</span>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface PaletteGroup {
  id: string;
  label: string;
  commands: PaletteCommand[];
}

function buildGroups(
  all: PaletteCommand[],
  recents: string[],
  query: string,
): PaletteGroup[] {
  const filtered = query ? filterByQuery(all, query) : all;
  if (query) {
    const byGroup = new Map<string, PaletteCommand[]>();
    for (const cmd of filtered) {
      const key = cmd.group ?? "Інше";
      const arr = byGroup.get(key) ?? [];
      arr.push(cmd);
      byGroup.set(key, arr);
    }
    const out: PaletteGroup[] = [];
    for (const [label, commands] of byGroup) {
      out.push({ id: `g-${label}`, label, commands });
    }
    return out;
  }

  const out: PaletteGroup[] = [];
  if (recents.length > 0) {
    const map = new Map(all.map((c) => [c.id, c] as const));
    const recentCmds: PaletteCommand[] = [];
    for (const id of recents) {
      const cmd = map.get(id);
      if (cmd) recentCmds.push(cmd);
    }
    if (recentCmds.length > 0) {
      out.push({ id: "recent", label: "Нещодавні", commands: recentCmds });
    }
  }

  const byGroup = new Map<string, PaletteCommand[]>();
  for (const cmd of filtered) {
    const key = cmd.group ?? "Інше";
    const arr = byGroup.get(key) ?? [];
    arr.push(cmd);
    byGroup.set(key, arr);
  }
  for (const [label, commands] of byGroup) {
    out.push({ id: `g-${label}`, label, commands });
  }
  return out;
}

/** Simple fuzzy-ish filter: lowercased substring on title + keywords. */
function filterByQuery(all: PaletteCommand[], query: string): PaletteCommand[] {
  const q = query.toLowerCase();
  return all.filter((cmd) => {
    if (cmd.title.toLowerCase().includes(q)) return true;
    if (cmd.description?.toLowerCase().includes(q)) return true;
    if (cmd.keywords?.some((k) => k.toLowerCase().includes(q))) return true;
    return false;
  });
}

interface CommandGroupProps {
  group: PaletteGroup;
  activeId: string | undefined;
  onHover: (id: string) => void;
  onActivate: (cmd: PaletteCommand) => void;
}

function CommandGroup({
  group,
  activeId,
  onHover,
  onActivate,
}: CommandGroupProps) {
  return (
    <div role="group" aria-label={group.label} className="mb-1.5">
      <div
        // eslint-disable-next-line sergeant-design/no-eyebrow-drift -- intentional palette group-header eyebrow; SectionHeading is overkill for inline list.
        className="px-4 pt-1 pb-1 text-style-caption uppercase tracking-wide font-semibold text-subtle"
      >
        {group.label}
      </div>
      <ul role="presentation" className="px-1.5 space-y-0.5">
        {group.commands.map((cmd) => (
          <li key={cmd.id} role="presentation">
            <button
              id={`cmd-${cmd.id}`}
              type="button"
              role="option"
              aria-selected={activeId === cmd.id}
              aria-disabled={cmd.disabled || undefined}
              disabled={cmd.disabled}
              onMouseEnter={() => !cmd.disabled && onHover(cmd.id)}
              onClick={() => onActivate(cmd)}
              className={cn(
                "flex w-full items-center gap-3 px-2.5 py-2 text-left rounded-xl",
                "transition-colors duration-150",
                "outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
                "focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
                activeId === cmd.id && !cmd.disabled && "bg-panelHi",
                cmd.disabled && "opacity-50 cursor-not-allowed",
              )}
            >
              {cmd.icon ? (
                <span className="shrink-0 w-5 h-5 flex items-center justify-center text-muted">
                  {cmd.icon}
                </span>
              ) : (
                <span className="shrink-0 w-5 h-5" aria-hidden="true" />
              )}
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-text truncate">
                  {cmd.title}
                </span>
                {cmd.description ? (
                  <span className="block text-xs text-muted truncate">
                    {cmd.description}
                  </span>
                ) : null}
              </span>
              {cmd.shortcut ? (
                <kbd
                  className={cn(
                    "shrink-0 ml-2 inline-flex items-center px-1.5 h-5",
                    "text-style-caption font-mono font-semibold text-muted",
                    "bg-surface-muted border border-line rounded-md",
                  )}
                >
                  {cmd.shortcut}
                </kbd>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
