import { useEffect } from "react";

interface HubKeyboardShortcutsOptions {
  onOpenSearch: () => void;
  onOpenShortcuts: () => void;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function useHubKeyboardShortcuts({
  onOpenSearch,
  onOpenShortcuts,
}: HubKeyboardShortcutsOptions) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenSearch();
        return;
      }

      if (!mod && event.key === "?") {
        event.preventDefault();
        onOpenShortcuts();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpenSearch, onOpenShortcuts]);
}
