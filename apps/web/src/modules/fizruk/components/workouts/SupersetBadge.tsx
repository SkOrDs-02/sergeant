/**
 * Pill that marks a workout item as part of a superset (parallel) or
 * circuit (sequential) group. Tinted with the success / fizruk module
 * palette so paired items stand out against the regular item border.
 */
export function SupersetBadge({ type }: { type: "circuit" | "superset" }) {
  return (
    <span
      // eslint-disable-next-line sergeant-design/no-eyebrow-drift -- Superset/circuit indicator pill at text-2xs with dynamic module tint; defer Badge migration.
      className={`text-2xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${type === "circuit" ? "bg-fizruk/15 text-fizruk border border-fizruk/30" : "bg-success/15 text-success border border-success/30"}`}
    >
      {type === "circuit" ? "Коло" : "Суперсет"}
    </span>
  );
}
