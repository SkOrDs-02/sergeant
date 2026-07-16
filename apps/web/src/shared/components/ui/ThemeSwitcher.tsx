/**
 * Last validated: 2026-05-14
 * Status: Active
 */
/**
 * ThemeSwitcher — uniform UI control for the 4-mode theme contract
 * (`useTheme`): light · dark · system · HC.
 *
 * Compact segmented control (icon + short label per choice) — the one
 * surface used app-wide (header "⋯" menu). A verbose `dropdown` variant
 * existed here until round-2 UI audit X4: it had zero production
 * call-sites (only its own tests/story rendered it) — the app-wide menu
 * always passed `variant="segmented"` — so the labels a prior round wrote
 * into it never actually shipped to users. Deleted rather than kept
 * "just in case" (YAGNI); this file is the single surface now.
 *
 * Token-only styling: усі стани йдуть через семантичні токени
 * (`bg-panel`, `text-text`, `border-line`, `bg-brand-soft`, …) — жодного
 * inline hex (Hard Rule #11) і жодних raw light/dark пар (Hard Rule #13).
 * Focus індикатори — `focus-visible:` only (Hard Rule #14).
 */

import { cn } from "@shared/lib/ui/cn";
import { Icon } from "./Icon";
import {
  THEME_CHOICES,
  THEME_CHOICE_ICONS,
  THEME_CHOICE_LABELS,
  type ThemeChoice,
  useTheme,
} from "@shared/hooks/useTheme";
import { hapticTap } from "@shared/lib/adapters/haptic";

const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

export interface ThemeSwitcherProps {
  /** Override container className (extra layout slot — gap, margin). */
  className?: string | undefined;
}

/**
 * Under-icon captions (round-2 UI audit X4 — owner decision: name every
 * theme, not just show icons). Distinct from `THEME_CHOICE_SHORT_LABELS`
 * (used elsewhere for a single-line trigger): "Системна" reads clearer
 * than "Авто" once it's sitting under an icon rather than next to one.
 */
const SEGMENTED_CAPTIONS: Record<ThemeChoice, string> = {
  light: "Світла",
  dark: "Темна",
  system: "Авто",
  hc: "Контраст",
};

interface SwitchButtonProps {
  choice: ThemeChoice;
  isActive: boolean;
  onSelect: (next: ThemeChoice) => void;
}

function SwitchIconButton({ choice, isActive, onSelect }: SwitchButtonProps) {
  const icon = THEME_CHOICE_ICONS[choice];
  const label = THEME_CHOICE_LABELS[choice];
  const caption = SEGMENTED_CAPTIONS[choice];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      aria-label={label}
      onClick={() => {
        if (!isActive) {
          hapticTap();
          onSelect(choice);
        }
      }}
      className={cn(
        "flex-1 min-w-0 min-h-11 flex flex-col items-center justify-center gap-1 px-1.5 py-1.5 rounded-xl border transition-[background-color,border-color,color,box-shadow] motion-reduce:transition-none",
        FOCUS_RING,
        isActive
          ? "bg-brand-soft border-brand-soft-border text-brand-strong dark:text-brand shadow-sm"
          : "bg-transparent border-transparent text-muted hover:text-text hover:bg-panelHi",
      )}
    >
      <Icon name={icon} size="md" aria-hidden />
      <span className="max-w-full truncate text-style-caption leading-tight">
        {caption}
      </span>
    </button>
  );
}

export function ThemeSwitcher({ className }: ThemeSwitcherProps) {
  const { choice, setChoice } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Тема"
      className={cn(
        "inline-flex items-stretch gap-1 rounded-2xl border border-line bg-panel/80 backdrop-blur-sm p-1",
        className,
      )}
    >
      {THEME_CHOICES.map((value) => (
        <SwitchIconButton
          key={value}
          choice={value}
          isActive={choice === value}
          onSelect={setChoice}
        />
      ))}
    </div>
  );
}
