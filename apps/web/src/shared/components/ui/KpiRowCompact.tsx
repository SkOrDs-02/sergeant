/**
 * Last validated: 2026-05-18
 * Status: Active
 */
import type { ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";

/**
 * Sergeant Design System — KpiRowCompact (P2 primitive)
 *
 * One-line meta row for KPI tuples — replaces the v1 pattern of 3-4
 * naked KPI tiles inside a hero card (see Routine `CalendarHero` legacy
 * pre-v2). Each item renders as a tight `label · value` pair so a 4-up
 * KPI strip stays inside the hero shell without dominating it.
 *
 * Typography:
 *   - `label` → `.text-style-caption` (12px, Hard Rule #16 floor).
 *   - `value` → `.text-style-label` font-medium, `tabular-nums` for
 *     numeric stat alignment.
 *
 * `module` prop tints the bullet separator only — it does NOT recolor
 * the values themselves; the surrounding hero card already carries
 * module identity. Pass it when the host card is module-branded so the
 * dot separator picks up `text-{module}` instead of the neutral line.
 *
 * Truncation: each item shrinks-but-doesn't-wrap on mobile via
 * `min-w-0` on the children. On very narrow viewports horizontal
 * scrolling kicks in (`overflow-x-auto`).
 */

export type KpiModule = "finyk" | "fizruk" | "routine" | "nutrition";

export interface KpiItem {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}

export interface KpiRowCompactProps {
  items: KpiItem[];
  module?: KpiModule;
  className?: string;
}

const separatorClass: Record<KpiModule | "neutral", string> = {
  finyk: "text-finyk",
  fizruk: "text-fizruk",
  routine: "text-routine",
  nutrition: "text-nutrition",
  neutral: "text-line",
};

export function KpiRowCompact({
  items,
  module,
  className,
}: KpiRowCompactProps) {
  if (items.length === 0) return null;
  const sepClass = separatorClass[module ?? "neutral"];

  return (
    <ul
      className={cn(
        "flex flex-row flex-wrap items-center gap-x-4 gap-y-2 overflow-x-auto",
        className,
      )}
    >
      {items.map((item, idx) => (
        <li
          key={`${item.label}-${idx}`}
          className="flex min-w-0 items-center gap-2"
        >
          {idx > 0 && (
            <span aria-hidden="true" className={cn("text-xs", sepClass)}>
              ·
            </span>
          )}
          {item.icon != null && (
            <span aria-hidden="true" className="shrink-0 text-subtle">
              {item.icon}
            </span>
          )}
          <span className="text-style-caption text-subtle">{item.label}</span>
          <span className="text-style-label font-medium text-text tabular-nums">
            {item.value}
          </span>
        </li>
      ))}
    </ul>
  );
}
