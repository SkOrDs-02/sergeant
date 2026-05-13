/**
 * ThemeSwitcher — uniform UI control for the 4-mode theme contract
 * (`useTheme`): light · dark · system · HC.
 *
 * Two surfaces in one primitive:
 *   - `variant="segmented"` (default) — compact 4-icon segmented control,
 *     good fit for header chrome and dense settings rows.
 *   - `variant="dropdown"` — single trigger button with a labelled
 *     menu, good fit for verbose surfaces (Settings → "Тема", DesignShowcase).
 *
 * Token-only styling: усі стани йдуть через семантичні токени
 * (`bg-panel`, `text-text`, `border-line`, `bg-brand-soft`, …) — жодного
 * inline hex (Hard Rule #11) і жодних raw light/dark пар (Hard Rule #13).
 * Focus індикатори — `focus-visible:` only (Hard Rule #14).
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "./Icon";
import {
  THEME_CHOICES,
  THEME_CHOICE_ICONS,
  THEME_CHOICE_LABELS,
  THEME_CHOICE_SHORT_LABELS,
  type ThemeChoice,
  useTheme,
} from "@shared/hooks/useTheme";
import { hapticTap } from "@shared/lib/adapters/haptic";

const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

type ThemeSwitcherVariant = "segmented" | "dropdown";

export interface ThemeSwitcherProps {
  /** Compact segmented control (default) or verbose dropdown. */
  variant?: ThemeSwitcherVariant;
  /** Override container className (extra layout slot — gap, margin). */
  className?: string;
}

interface SwitchButtonProps {
  choice: ThemeChoice;
  isActive: boolean;
  onSelect: (next: ThemeChoice) => void;
  size?: "sm" | "md";
}

function SwitchIconButton({
  choice,
  isActive,
  onSelect,
  size = "md",
}: SwitchButtonProps) {
  const icon = THEME_CHOICE_ICONS[choice];
  const label = THEME_CHOICE_LABELS[choice];
  const short = THEME_CHOICE_SHORT_LABELS[choice];
  const dimensions =
    size === "sm" ? "w-9 h-9 sm:w-9 sm:h-9" : "w-11 h-11 sm:w-10 sm:h-10";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      aria-label={label}
      title={short}
      onClick={() => {
        if (!isActive) {
          hapticTap();
          onSelect(choice);
        }
      }}
      className={cn(
        dimensions,
        "flex items-center justify-center rounded-xl border transition-[background-color,border-color,color,box-shadow] motion-reduce:transition-none",
        FOCUS_RING,
        isActive
          ? "bg-brand-soft border-brand-soft-border text-brand-strong dark:text-brand shadow-sm"
          : "bg-transparent border-transparent text-muted hover:text-text hover:bg-panelHi",
      )}
    >
      <Icon name={icon} size="md" />
    </button>
  );
}

function SegmentedSwitcher({
  choice,
  setChoice,
  className,
}: {
  choice: ThemeChoice;
  setChoice: (next: ThemeChoice) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Тема"
      className={cn(
        "inline-flex items-center gap-1 rounded-2xl border border-line bg-panel/80 backdrop-blur-sm p-1",
        className,
      )}
    >
      {THEME_CHOICES.map((value) => (
        <SwitchIconButton
          key={value}
          choice={value}
          isActive={choice === value}
          onSelect={setChoice}
          size="sm"
        />
      ))}
    </div>
  );
}

interface DropdownItemProps {
  choice: ThemeChoice;
  isActive: boolean;
  onSelect: (next: ThemeChoice) => void;
  description: string;
}

function DropdownItem({
  choice,
  isActive,
  onSelect,
  description,
}: DropdownItemProps) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={isActive}
      onClick={() => onSelect(choice)}
      className={cn(
        "w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-colors motion-reduce:transition-none",
        FOCUS_RING,
        isActive
          ? "bg-brand-soft text-brand-strong dark:text-brand"
          : "text-text hover:bg-panelHi",
      )}
    >
      <span
        className={cn(
          "shrink-0 mt-0.5 w-8 h-8 inline-flex items-center justify-center rounded-md border",
          isActive
            ? "border-brand-soft-border bg-panel/60"
            : "border-line bg-panel/60",
        )}
      >
        <Icon name={THEME_CHOICE_ICONS[choice]} size="md" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-style-label leading-tight">
          {THEME_CHOICE_LABELS[choice]}
        </span>
        <span className="block text-xs text-muted leading-snug mt-0.5">
          {description}
        </span>
      </span>
      {isActive && (
        <Icon
          name="check"
          size="sm"
          className="shrink-0 mt-1.5 text-brand-strong dark:text-brand"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

const DROPDOWN_DESCRIPTIONS: Record<ThemeChoice, string> = {
  light: "Світла поверхня, тепла кремова палітра.",
  dark: "Глибокий warm-charcoal для вечора та OLED.",
  system: "Слідує за prefers-color-scheme операційної системи.",
  hc: "AAA-leaning контраст: товстіші дільники, ширший focus ring.",
};

function DropdownSwitcher({
  choice,
  setChoice,
  isHighContrast,
  className,
}: {
  choice: ThemeChoice;
  setChoice: (next: ThemeChoice) => void;
  isHighContrast: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // Close on outside click + ESC; focus returns to the trigger.
  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      close();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, close]);

  const handleSelect = useCallback(
    (next: ThemeChoice) => {
      setChoice(next);
      hapticTap();
      close();
      buttonRef.current?.focus();
    },
    [setChoice, close],
  );

  const activeIcon = THEME_CHOICE_ICONS[choice];
  const activeLabel = THEME_CHOICE_LABELS[choice];

  return (
    <div className={cn("relative inline-block text-left", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex items-center gap-2 h-10 px-3 rounded-2xl border border-line bg-panel text-style-label text-text hover:bg-panelHi transition-colors motion-reduce:transition-none",
          FOCUS_RING,
        )}
      >
        <Icon name={activeIcon} size="md" />
        <span>{activeLabel}</span>
        {/* Compact "HC" pill — informs the user that HC is layered
            on top of the current choice. Avoids the eyebrow combo
            (no `uppercase`+`tracking-*`+`text-*`) so it stays inside
            the design-system primitive contract. */}
        {isHighContrast && choice !== "hc" && (
          <span className="ml-1 text-2xs font-bold text-muted bg-panelHi px-1.5 py-0.5 rounded-md">
            HC
          </span>
        )}
        <Icon
          name="chevron-down"
          size="sm"
          aria-hidden="true"
          className="text-muted"
        />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Вибір теми"
          className="absolute right-0 mt-2 w-72 rounded-2xl border border-line bg-panel shadow-float p-1.5 z-50"
        >
          {THEME_CHOICES.map((value) => (
            <DropdownItem
              key={value}
              choice={value}
              isActive={choice === value}
              onSelect={handleSelect}
              description={DROPDOWN_DESCRIPTIONS[value]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ThemeSwitcher({
  variant = "segmented",
  className,
}: ThemeSwitcherProps) {
  const { choice, setChoice, isHighContrast } = useTheme();
  if (variant === "dropdown") {
    return (
      <DropdownSwitcher
        choice={choice}
        setChoice={setChoice}
        isHighContrast={isHighContrast}
        className={className}
      />
    );
  }
  return (
    <SegmentedSwitcher
      choice={choice}
      setChoice={setChoice}
      className={className}
    />
  );
}
