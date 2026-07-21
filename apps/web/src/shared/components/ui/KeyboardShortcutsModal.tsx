import {
  useEffect,
  useCallback,
  useState,
  useContext,
  createContext,
  useRef,
  useLayoutEffect,
  useMemo,
} from "react";

export interface KeyboardShortcut {
  keys: string[];
  description: string;
  category?: string;
}

// ─── Centralized shortcut registry ───────────────────────────────────────────
// Modules call `useRegisterShortcuts(shortcuts)` to add their own entries.
// The modal reads the merged list so module-specific shortcuts appear
// alongside global ones without hard-coding them in DEFAULT_SHORTCUTS.

interface ShortcutRegistryEntry {
  id: string;
  shortcuts: KeyboardShortcut[];
}

interface ShortcutRegistryContextValue {
  register: (entry: ShortcutRegistryEntry) => void;
  unregister: (id: string) => void;
  getAll: () => KeyboardShortcut[];
}

export const ShortcutRegistryContext =
  createContext<ShortcutRegistryContextValue | null>(null);

/**
 * Provider that collects shortcuts registered by modules/features.
 * Wrap the app root (or the hub shell) with this once.
 */
export function ShortcutRegistryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const entriesRef = useRef<Map<string, KeyboardShortcut[]>>(new Map());
  const [, forceUpdate] = useState(0);

  const register = useCallback((entry: ShortcutRegistryEntry) => {
    entriesRef.current.set(entry.id, entry.shortcuts);
    forceUpdate((n) => n + 1);
  }, []);

  const unregister = useCallback((id: string) => {
    entriesRef.current.delete(id);
    forceUpdate((n) => n + 1);
  }, []);

  const getAll = useCallback((): KeyboardShortcut[] => {
    const all: KeyboardShortcut[] = [];
    for (const shortcuts of entriesRef.current.values()) {
      all.push(...shortcuts);
    }
    return all;
  }, []);
  return (
    <ShortcutRegistryContext.Provider value={{ register, unregister, getAll }}>
      {children}
    </ShortcutRegistryContext.Provider>
  );
}

/**
 * Register module-specific shortcuts in the global modal.
 * Shortcuts are automatically removed when the component unmounts.
 *
 * @example
 * useRegisterShortcuts("finyk", [
 *   { keys: ["N"], description: "Нова витрата", category: "Finyk" },
 * ]);
 */
export function useRegisterShortcuts(
  registrationId: string,
  shortcuts: KeyboardShortcut[],
) {
  const registry = useContext(ShortcutRegistryContext);
  const register = registry?.register;
  const unregister = registry?.unregister;
  const shortcutsRef = useRef(shortcuts);
  const shortcutsRevision = useMemo(
    () =>
      shortcuts
        .map(
          (s) => `${s.keys.join("+")}\0${s.description}\0${s.category ?? ""}`,
        )
        .join("\n"),
    [shortcuts],
  );
  useLayoutEffect(() => {
    shortcutsRef.current = shortcuts;
  });

  useEffect(() => {
    if (!register || !unregister || shortcutsRef.current.length === 0) return;
    register({
      id: registrationId,
      shortcuts: shortcutsRef.current,
    });
    return () => unregister(registrationId);
  }, [
    register,
    unregister,
    registrationId,
    shortcutsRevision,
    shortcuts.length,
  ]);
}

/**
 * Hook to listen for ? key press and toggle the shortcuts modal
 */
export function useKeyboardShortcutsModal() {
  const [open, setOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in input/textarea
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      return;
    }

    if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return {
    open,
    setOpen,
    onClose: () => setOpen(false),
  };
}
