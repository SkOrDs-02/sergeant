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
      aria-label={label}
      onClick={() => onClick(value)}
      // In a roving tabIndex pattern the selected item (or first if none)
      // is in the tab sequence; all others are skipped.
      tabIndex={tabbable ? 0 : -1}
      // Round-3 UI audit T2: tile shows only the digit — the word label
      // moved to `aria-label` + the selected-level caption rendered once
      // under the whole row (`Body.tsx`), not repeated inside each tile.
      className={cn(
        "focus-ring flex-1 aspect-square min-h-11 flex items-center justify-center rounded-xl border text-style-title transition-[background-color,border-color,color]",
        selected
          ? "bg-success-strong text-white border-success-strong"
          : "border-line text-subtle hover:border-success/50 hover:text-text",
      )}
      title={label}
    >
      {value}
    </button>
  );
}

/** Renders the chosen level's name once under a `ScoreButton` row, since
 * the tiles themselves now show only the digit (round-3 UI audit T2). */
export function SelectedLevelLabel({
  shortLabel,
  value,
  labels,
}: {
  shortLabel: string;
  value: number | null;
  labels: readonly string[];
}) {
  if (value == null) return null;
  return (
    <p
      className="mt-1.5 text-style-caption text-subtle text-center"
      aria-live="polite"
    >
      {shortLabel}: {labels[value]}
    </p>
  );
}
