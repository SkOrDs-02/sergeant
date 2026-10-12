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
  return <span className="text-style-caption text-muted">{label}</span>;
}

/**
 * "A1" / "A2" style member-position label rendered inside a superset/
 * circuit member's `WorkoutItemCard`. Redesign 2026-08 (item 8): the
 * full `SupersetBadge` used to render on the group container AND on
 * every member card inside it — duplicated colour + text for no new
 * information. Now the badge lives on the container only
 * (`WorkoutItemsList`'s group wrapper); each member gets this
 * lightweight ordinal instead, matching the familiar A1/A2/A3
 * strength-training convention for superset/circuit members. `1-based`
 * — pass the member's position within `WorkoutGroup.itemIds`.
 */
export function SupersetMemberLabel({ position }: { position: number }) {
  return (
    <span className="text-style-caption text-muted tabular-nums">
      {`A${position}`}
    </span>
  );
}
