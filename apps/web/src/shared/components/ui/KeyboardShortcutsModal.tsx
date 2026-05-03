import {
  useEffect,
  useCallback,
  useState,
  useContext,
  createContext,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/ui/cn";
import { Icon } from "./Icon";
import { useFocusTrap } from "../../hooks/useFocusTrap";

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

  useEffect(() => {
    if (!registry || shortcuts.length === 0) return;
    registry.register({ id: registrationId, shortcuts });
    return () => registry.unregister(registrationId);
    // Intentionally omit `shortcuts` from deps — callers typically pass
    // an inline array; deep comparison would require JSON serialization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, registrationId]);
}

const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  // Global
  {
    keys: ["?"],
    description: "Показати комбінації клавіш",
    category: "Загальні",
  },
  { keys: ["Cmd", "K"], description: "Глобальний пошук", category: "Загальні" },
  {
    keys: ["Esc"],
    description: "Закрити модал / скасувати",
    category: "Загальні",
  },
  {
    keys: ["Cmd", "/"],
    description: "Відкрити AI-асистента",
    category: "Загальні",
  },

  // Navigation
  { keys: ["G", "H"], description: "Перейти на Hub", category: "Навігація" },
  { keys: ["G", "F"], description: "Перейти до Finyk", category: "Навігація" },
  { keys: ["G", "T"], description: "Перейти до Fizruk", category: "Навігація" },
  {
    keys: ["G", "R"],
    description: "Перейти до Routine",
    category: "Навігація",
  },
  {
    keys: ["G", "N"],
    description: "Перейти до Nutrition",
    category: "Навігація",
  },

  // Actions
  {
    keys: ["N"],
    description: "Нова запис (в контексті модуля)",
    category: "Дії",
  },
  { keys: ["Cmd", "S"], description: "Зберегти", category: "Дії" },
  { keys: ["Cmd", "Z"], description: "Скасувати дію", category: "Дії" },
];

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
  shortcuts?: KeyboardShortcut[];
}

function KeyBadge({ children }: { children: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center min-w-[24px] h-6 px-1.5",
        "text-style-caption text-text",
        "bg-surface border border-line rounded-xl shadow-sm",
      )}
    >
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsModal({
  open,
  onClose,
  shortcuts = DEFAULT_SHORTCUTS,
}: KeyboardShortcutsModalProps) {
  const modalRef = useFocusTrap<HTMLDivElement>(open, onClose);
  const registry = useContext(ShortcutRegistryContext);

  // Merge base shortcuts with any registered by modules
  const mergedShortcuts = registry
    ? [...shortcuts, ...registry.getAll()]
    : shortcuts;

  // Group shortcuts by category
  const grouped = mergedShortcuts.reduce(
    (acc, shortcut) => {
      const cat = shortcut.category || "Інше";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(shortcut);
      return acc;
    },
    {} as Record<string, KeyboardShortcut[]>,
  );

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-shortcuts-title"
    >
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 cursor-default"
        onClick={onClose}
        aria-label="Закрити модальне вікно"
        tabIndex={-1}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className={cn(
          "relative w-full max-w-lg max-h-[80vh] overflow-y-auto",
          "bg-panel border border-line rounded-2xl shadow-float",
          "animate-in fade-in zoom-in-95 duration-200",
        )}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-line bg-panel/95 backdrop-blur-sm rounded-t-2xl">
          <h2
            id="keyboard-shortcuts-title"
            className="text-style-title text-text"
          >
            Комбінації клавіш
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-muted hover:text-text hover:bg-surface transition-colors"
            aria-label="Закрити"
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <h3 className="text-style-label text-muted mb-3">{category}</h3>
              <div className="space-y-2">
                {items.map((shortcut, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-surface/50 transition-colors"
                  >
                    <span className="text-sm text-text">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIdx) => (
                        <KeyBadge key={keyIdx}>
                          {key === "Cmd"
                            ? navigator.platform.includes("Mac")
                              ? "⌘"
                              : "Ctrl"
                            : key}
                        </KeyBadge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="p-4 border-t border-line text-center">
          <p className="text-xs text-muted">
            Натисни <KeyBadge>?</KeyBadge> будь-де щоб відкрити цю довідку
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
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
