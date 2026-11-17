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

/** Renders the chosen level's name once under a score row, since the tiles
 * show only the digit (round-3 UI audit T2). */
export function SelectedLevelLabel({
  shortLabel,
  value,
  labels,
}: {
  shortLabel: string;
  value: number | null;
  labels: readonly string[];
}) {
  // Defect #4: the region used to mount ONLY once a value existed, so the
  // very first selection appeared together with its own live region —
  // nothing was there yet for AT to watch, so the first announcement was
  // lost. `aria-live` only fires on a MUTATION of an already-present node,
  // not on a node that mounts pre-filled. Keep the `<p>` mounted always;
  // render a non-breaking-space placeholder (escape sequence, not a literal
  // char — see `NARROW_NBSP` in `formatMoney.ts` for why) so the row keeps
  // its reserved height instead of collapsing to zero before any pick.
  return (
    <p
      className="mt-1.5 text-style-caption text-subtle text-center"
      aria-live="polite"
    >
      {value == null ? "\u00A0" : `${shortLabel}: ${labels[value]}`}
    </p>
  );
}
