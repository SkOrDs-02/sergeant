/**
 * Sergeant Design System — CommandPalette
 *
 * Global Cmd/Ctrl+K surface. Provides:
 *   - A pluggable registry (`CommandPaletteProvider` + `useRegisterCommand`)
 *     that lets any module contribute commands at runtime.
 *   - A portal-mounted modal with a search input, debounced filtering,
 *     grouped results, keyboard nav (Arrow / Home / End / Enter / Esc),
 *     and "Recent" commands persisted in localStorage.
 *
 * Wire-up:
 *   1. Mount `<CommandPaletteProvider>` once near the app root.
 *   2. Render `<CommandPalette />` somewhere inside the provider.
 *   3. Bind global ⌘K / Ctrl+K with `useCommandPaletteHotkey()` —
 *      gated behind the `hub_command_palette` feature flag.
 *   4. Register commands from any descendant via `useRegisterCommand`.
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
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@shared/lib/ui/cn";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { Icon } from "./Icon";
import {
  CommandPaletteContext,
  RECENTS_STORE,
  RECENTS_MAX,
  type CommandPaletteContextValue,
  type PaletteCommand,
  type RegisterCommandsInput,
} from "./CommandPalette.context";

export type { PaletteCommand };

const SEARCH_DEBOUNCE_MS = 80;

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const registryRef = useRef<Map<string, PaletteCommand[]>>(new Map());
  const [revision, setRevision] = useState(0);
  const [recents, setRecents] = useState<string[]>(() => RECENTS_STORE.get());

  // Subscribe to recents changes from other tabs.
  useEffect(() => {
    return RECENTS_STORE.subscribe((next) => setRecents(next));
  }, []);

  const register = useCallback((input: RegisterCommandsInput) => {
    registryRef.current.set(input.id, input.commands.slice());
    setRevision((n) => n + 1);
  }, []);

  const unregister = useCallback((id: string) => {
    registryRef.current.delete(id);
    setRevision((n) => n + 1);
  }, []);

  const getAll = useCallback((): PaletteCommand[] => {
    const out: PaletteCommand[] = [];
    for (const list of registryRef.current.values()) out.push(...list);
    return out;
  }, []);

  const markRecent = useCallback((commandId: string) => {
    const next = [
      commandId,
      ...RECENTS_STORE.get().filter((id) => id !== commandId),
    ].slice(0, RECENTS_MAX);
    RECENTS_STORE.set(next);
    setRecents(next);
  }, []);

  const openPalette = useCallback(() => setOpen(true), []);
  const closePalette = useCallback(() => setOpen(false), []);
  const togglePalette = useCallback(() => setOpen((p) => !p), []);

  // `revision` ticks force a refresh of any consumer that calls getAll().
  const value = useMemo<CommandPaletteContextValue>(
    () => ({
      open,
      openPalette,
      closePalette,
      togglePalette,
      register,
      unregister,
      getAll,
      recents,
      markRecent,
      // expose revision so the palette UI re-renders when commands change
      revision,
    }),
    [
      open,
      openPalette,
      closePalette,
      togglePalette,
      register,
      unregister,
      getAll,
      recents,
      markRecent,
      revision,
    ],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

/**
 * Read the palette context. Returns `null` outside the provider — callers
 * that opt-in via the hook below get a defensive no-op fallback so a
 * missing provider never crashes the app.
 */
export function useCommandPalette(): CommandPaletteContextValue | null {
  return useContext(CommandPaletteContext);
}

/**
 * Imperative open() / close() / toggle() handle. Use this from buttons /
 * effects that want to drive the palette without subscribing to the
 * `getAll()` data.
 */
export function useCommandPaletteControls(): {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: boolean;
} {
  const ctx = useContext(CommandPaletteContext);
  return {
    open: ctx?.openPalette ?? noop,
    close: ctx?.closePalette ?? noop,
    toggle: ctx?.togglePalette ?? noop,
    isOpen: ctx?.open ?? false,
  };
}

function noop() {
  /* intentional no-op when palette provider is absent */
}

/**
 * Register a set of commands for the lifetime of the calling component.
 * Commands are removed automatically on unmount.
 *
 * The `commands` array is captured by id — pass `[]` to temporarily clear
 * a registration without unmounting. We intentionally skip deep equality
 * to avoid an `JSON.stringify` per render; consumers are expected to
 * `useMemo` their command array if they generate it dynamically.
 *
 * @example
 * ```tsx
 * useRegisterCommand("hub-nav", [
 *   { id: "hub.go-home", title: "Перейти на головну", run: () => navigate("/") },
 * ]);
 * ```
 */
export function useRegisterCommand(
  registrationId: string,
  commands: ReadonlyArray<PaletteCommand>,
): void {
  const ctx = useContext(CommandPaletteContext);
  // Destructure the stable `useCallback`-with-`[]` refs so the effect
  // deps don't churn when the Provider's `value` object identity changes
  // (e.g. `revision`/`open`/`recents` updates). Depending on the whole
  // `ctx` object created an infinite re-register loop: calling `register`
  // bumps `revision`, which produces a new `value` ⇒ new `ctx` identity
  // ⇒ effect re-runs ⇒ `register` called again. React capped renders at
  // ~50 with a noisy `Maximum update depth exceeded` warning and a
  // visible UX stall on hot paths (post-auth navigation, route shells).
  const register = ctx?.register;
  const unregister = ctx?.unregister;
  useEffect(() => {
    if (!register || !unregister) return;
    if (commands.length === 0) {
      unregister(registrationId);
      return () => unregister(registrationId);
    }
    register({ id: registrationId, commands });
    return () => unregister(registrationId);
    // Intentionally omit `commands` from the deps — callers pass a
    // memoized list and we re-register only on id / context change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, unregister, registrationId]);
}

/**
 * Bind global ⌘K / Ctrl+K to open the palette. Wire this once in the app
 * shell, behind any feature flag the host needs. Ignores keypresses
 * inside editable fields so users typing in inputs keep their browser's
 * select-line shortcut.
 */
export function useCommandPaletteHotkey(enabled: boolean = true): void {
  const ctx = useContext(CommandPaletteContext);
  // See `useRegisterCommand` — depend on the stable `togglePalette`
  // callback, not the whole `ctx` object, so unrelated state ticks on
  // the provider (revision/open/recents) don't churn the keydown
  // listener attach/detach.
  const togglePalette = ctx?.togglePalette;
  useEffect(() => {
    if (!enabled || !togglePalette) return;
    const handler = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      if (event.key.toLowerCase() !== "k") return;
      const target = event.target as HTMLElement | null;
      // Allow ⌘K to fire from any context, including inputs — the palette
      // overlays everything and inputs typically don't own Cmd+K natively
      // beyond `select line`. Other shortcuts (like Cmd+S) remain free.
      if (target?.isContentEditable && event.altKey) return;
      event.preventDefault();
      togglePalette();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, togglePalette]);
}

// ─── UI ──────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) return null;
  return <CommandPaletteUI />;
}

function CommandPaletteUI() {
  const ctx = useContext(CommandPaletteContext)!;
  const { open, closePalette, recents, markRecent, revision } = ctx;
  const titleId = useId();
  const listId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useDialogFocusTrap(open, panelRef, { onEscape: closePalette });

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
        console.warn("[CommandPalette] run() threw", err);
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
              "text-2xs font-mono font-semibold text-muted",
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
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-line text-2xs text-muted">
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
        className="px-4 pt-1 pb-1 text-2xs uppercase tracking-wide font-semibold text-subtle"
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
                "outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
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
                    "text-2xs font-mono font-semibold text-muted",
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
