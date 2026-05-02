import { Modal } from "./Modal";

const shortcuts = [
  {
    keys: ["Ctrl", "K"],
    macKeys: ["⌘", "K"],
    label: "Відкрити глобальний пошук",
  },
  {
    keys: ["?"],
    label: "Показати клавіатурні скорочення",
  },
  {
    keys: ["Esc"],
    label: "Закрити поточне вікно",
  },
  {
    keys: ["↑", "↓", "Enter"],
    label: "Навігація в результатах пошуку",
  },
];

function isApplePlatform() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

function KeyCaps({ keys }: { keys: string[] }) {
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {keys.map((key) => (
        <kbd
          key={key}
          className="min-w-7 h-7 px-2 inline-flex items-center justify-center rounded-lg border border-line bg-panelHi text-xs font-bold text-text shadow-sm"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

export function KeyboardShortcutsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const apple = isApplePlatform();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Клавіатурні скорочення"
      size="sm"
      closeLabel="Закрити скорочення"
    >
      <div className="space-y-2">
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.label}
            className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5"
          >
            <span className="text-sm text-text">{shortcut.label}</span>
            <KeyCaps
              keys={
                apple && shortcut.macKeys ? shortcut.macKeys : shortcut.keys
              }
            />
          </div>
        ))}
      </div>
    </Modal>
  );
}
