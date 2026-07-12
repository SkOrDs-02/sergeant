import { cn } from "@shared/lib/ui/cn";

export const ENERGY_LABELS = [
  "",
  "Виснажений",
  "Втомлений",
  "Нормально",
  "Добре",
  "Відмінно",
];
export const MOOD_LABELS = [
  "",
  "Пригнічений",
  "Поганий",
  "Нейтральний",
  "Гарний",
  "Чудовий",
];

export interface ScoreButtonProps {
  value: number;
  selected: boolean;
  onClick: (value: number) => void;
  label: string;
  /**
   * Roving-tabindex tab stop. Exactly one radio per group must be `true`
   * (the selected one, or the first when none is selected) so the group is
   * reachable by keyboard even before any choice is made.
   */
  tabbable: boolean;
}

export function ScoreButton({
  value,
  selected,
  onClick,
  label,
  tabbable,
}: ScoreButtonProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onClick(value)}
      // In a roving tabIndex pattern the selected item (or first if none)
      // is in the tab sequence; all others are skipped.
      tabIndex={tabbable ? 0 : -1}
      className={cn(
        // `min-h-20` reserves room for a 2-line caption up front and
        // `justify-center` centers the number+caption within it, so a
        // one-line tile (stretched to match a 2-line sibling via the row's
        // default `align-items: stretch`) doesn't end up with its content
        // pinned to the top and a dead gap below (round-2 UI audit M2).
        "focus-ring flex-1 min-h-20 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl border text-style-caption transition-[background-color,border-color,color,opacity]",
        selected
          ? "bg-success-strong text-white border-success-strong"
          : "border-line text-subtle hover:border-success/50 hover:text-text",
      )}
      title={label}
    >
      <span className="text-base leading-none">{value}</span>
      <span
        className={cn(
          "text-style-caption leading-tight text-center break-words px-0.5",
          selected ? "text-white/80" : "text-muted",
        )}
      >
        {label}
      </span>
    </button>
  );
}
