/**
 * KeyboardShortcutsModal — UI body.
 *
 * Split out of `KeyboardShortcutsModal.tsx` so this portal-mounted modal
 * (focus-trap, category grouping, key badges, styles) ships as its own
 * lazy chunk. The lightweight registry Provider / Context / hooks and the
 * shared `KeyboardShortcut` type stay eager in the sibling module; this
 * body is dynamically imported at the render sites and gated behind the
 * modal `open` state, keeping it out of the entry bundle (initiative 0017).
 */

import { useContext } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/ui/cn";
import { Icon } from "./Icon";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  ShortcutRegistryContext,
  type KeyboardShortcut,
} from "./KeyboardShortcutsModal";

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
  { keys: ["G", "Z"], description: "Перейти до Fizruk", category: "Навігація" },
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
                    <span className="text-style-body text-text">
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
          <p className="text-style-caption text-muted">
            Натисни <KeyBadge>?</KeyBadge> будь-де щоб відкрити цю довідку
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
