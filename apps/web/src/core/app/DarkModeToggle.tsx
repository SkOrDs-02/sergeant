import { Icon } from "@shared/components/ui/Icon";

// Mirror `HubHeader.ICON_BUTTON_CLS`: 48 пкс на мобільному, 44 пкс ≥sm; focus-ring solid brand-500.
const CLS =
  "w-12 h-12 sm:w-11 sm:h-11 flex items-center justify-center rounded-2xl text-muted hover:text-text hover:bg-panelHi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

interface DarkModeToggleProps {
  dark: boolean;
  onToggle: () => void;
}

/** Sun/Moon icon toggle for dark mode */
export function DarkModeToggle({ dark, onToggle }: DarkModeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={dark ? "Увімкнути світлу тему" : "Увімкнути темну тему"}
      title={dark ? "Світла тема" : "Темна тема"}
      className={CLS}
    >
      <Icon name={dark ? "sun" : "moon"} size={20} />
    </button>
  );
}
