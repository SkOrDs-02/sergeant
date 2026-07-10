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
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { lazyImport } from "../../../core/lib/lazyImport";
import {
  CommandPaletteContext,
  RECENTS_STORE,
  RECENTS_MAX,
  type CommandPaletteContextValue,
  type PaletteCommand,
  type RegisterCommandsInput,
} from "./CommandPalette.context";

export type { PaletteCommand };

// The heavy palette body (portal, focus-trap, command list, styles) lives
// in a sibling module that is *only* reached through this lazy import — so
// it ships as its own chunk instead of inflating the entry bundle. The
// Provider / hooks above stay eager; the chunk loads on first open
// (initiative 0017). `lazyImport` adds the stale-Vercel-chunk recovery.
const CommandPaletteUI = lazyImport(
  () => import("./CommandPaletteUI"),
  "CommandPaletteUI",
);

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
  const commandsRef = useRef(commands);
  const commandsRevision = useMemo(
    () =>
      commands
        .map((c) => `${c.id}\0${c.title}\0${c.disabled ? 1 : 0}`)
        .join("\n"),
    [commands],
  );
  useLayoutEffect(() => {
    commandsRef.current = commands;
  });
  useEffect(() => {
    if (!register || !unregister) return;
    const current = commandsRef.current;
    if (current.length === 0) {
      unregister(registrationId);
      return () => unregister(registrationId);
    }
    register({ id: registrationId, commands: current });
    return () => unregister(registrationId);
  }, [register, unregister, registrationId, commandsRevision, commands.length]);
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

/**
 * Eager mount point for the ⌘K palette. Reads the provider context and
 * gates the heavy, portal-mounted body behind the `open` state: while
 * closed it renders nothing and the lazy chunk is never requested, so
 * the body stays out of the entry bundle. The hotkey hook
 * (`useCommandPaletteHotkey`) flips `open` to `true` eagerly on first
 * keypress; this mount then resolves `CommandPaletteUI` through the
 * `<Suspense>` boundary. The Provider above still wraps everything, so the
 * lazy body reads the same context (open state, command registry, recents).
 */
export function CommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx?.open) return null;
  return (
    <Suspense fallback={null}>
      <CommandPaletteUI />
    </Suspense>
  );
}
