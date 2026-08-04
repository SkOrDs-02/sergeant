/**
 * Pill that marks a workout item as part of a superset (parallel) or
 * circuit (sequential) group. Tinted with the success / fizruk module
 * palette so paired items stand out against the regular item border.
 *
 * `compact` swaps the "Суперсет" label for the abbreviated "СС" — used in
 * dense list rows (e.g. `WorkoutTemplatesSection`'s exercise reorder list)
 * where the full word doesn't fit.
 */
export function SupersetBadge({
  type,
  compact = false,
}: {
  type: "circuit" | "superset";
  compact?: boolean;
}) {
  const label = type === "circuit" ? "Коло" : compact ? "СС" : "Суперсет";
  return (
    <span
      className={`text-style-overline px-1.5 py-0.5 rounded-full ${type === "circuit" ? "bg-fizruk/15 text-fizruk border border-fizruk/30" : "bg-success/15 text-success-strong dark:text-success border border-success/30"}`}
    >
      {label}
    </span>
  );
}
