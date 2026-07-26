import { type ReactNode } from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";
import { cn } from "@shared/lib/ui/cn";
import { EmptyState } from "./EmptyState";

/**
 * Sergeant Design System — DataTable
 *
 * A single tabular primitive that replaces the module-local hand-rolled
 * `<table>` / `<thead>` / `<tbody>` blocks that drifted apart across
 * modules (finyk analytics, fizruk measurements guide, nutrition weekly
 * log). Each of those re-implemented zebra striping, header styling,
 * numeric alignment and empty-state handling slightly differently; this
 * component fixes one contract:
 *
 *   • **Numeric columns** (`numeric: true`) get right alignment +
 *     `tabular-nums` so digits line up in a column — the single most
 *     common table bug in the codebase.
 *   • **Density** (`comfortable` | `compact`) controls row padding so a
 *     dense financial table and a roomy guide table share one primitive.
 *   • **Module accent** tints the header text/border through the static
 *     per-module class map (never string-interpolated, so Tailwind's JIT
 *     always sees the class — mirrors `Card`'s `MODULE_PROMINENCE`).
 *   • **Sticky header** opts into `sticky top-0 z-sticky` — the elevation
 *     ↔ z-tier pairing from the design tokens, never an ad-hoc `z-[…]`.
 *   • **Empty state** delegates to `EmptyState` so an empty table reads
 *     exactly like every other empty surface (DataState contract).
 *
 * The row-header column (`rowHeader: true` on exactly one column) renders
 * a `<th scope="row">` for the accessible name of each row, matching the
 * WCAG pattern the fizruk measurements guide already used by hand.
 */

export type DataTableDensity = "comfortable" | "compact";

export interface DataTableColumn<T> {
  /** Stable id — also the React key for the column. */
  id: string;
  /** Header cell content. */
  header: ReactNode;
  /** Cell renderer for a row. */
  cell: (row: T, rowIndex: number) => ReactNode;
  /**
   * Numeric column: right-aligns the header + cells and applies
   * `tabular-nums` so digits align. Use for money, counts, deltas.
   */
  numeric?: boolean;
  /**
   * Render this column as the row's `<th scope="row">` (its accessible
   * name). At most one column should set this; the first one wins.
   */
  rowHeader?: boolean;
  /** Optional fixed width (any CSS width, e.g. `"3rem"`, `"20%"`). */
  width?: string;
  /** Extra classes merged onto every cell in this column. */
  className?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** Stable row key. */
  getRowKey: (row: T, rowIndex: number) => string;
  /** Module accent for the header. Omit for a neutral table. */
  module?: ModuleAccent;
  /** Row padding density. Defaults to `comfortable`. */
  density?: DataTableDensity;
  /** Zebra-stripe alternate rows. Defaults to `false`. */
  zebra?: boolean;
  /** Make the header stick to the top of the scroll container. */
  stickyHeader?: boolean;
  /**
   * Shown when `rows` is empty. Pass a ready `EmptyState` (or any node);
   * a string is wrapped in the compact `EmptyState` for consistency.
   */
  empty?: ReactNode;
  /** Accessible caption / label for the table. Rendered `sr-only`. */
  caption?: string;
  /** Optional click handler per row (makes rows interactive). */
  onRowClick?: (row: T, rowIndex: number) => void;
  /** Wrapper class (e.g. `overflow-x-auto` container tweaks). */
  className?: string;
}

// Static per-module header treatment — never interpolated, so Tailwind's
// JIT always emits these classes. Light uses the `-strong` companion
// (AA on the panel), dark rides the lighter `-300` tier at `/70` for the
// de-emphasised header, matching SectionHeading's module eyebrow rule.
const MODULE_HEADER: Record<ModuleAccent, string> = {
  finyk: "text-finyk-strong dark:text-finyk-300/70",
  fizruk: "text-fizruk-strong dark:text-fizruk-300/70",
  routine: "text-routine-strong dark:text-routine-300/70",
  nutrition: "text-nutrition-strong dark:text-nutrition/80",
};

const DENSITY_CELL: Record<DataTableDensity, string> = {
  comfortable: "px-3 py-2.5",
  compact: "px-3 py-1.5",
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  module,
  density = "comfortable",
  zebra = false,
  stickyHeader = false,
  empty,
  caption,
  onRowClick,
  className,
}: DataTableProps<T>) {
  if (rows.length === 0 && empty != null) {
    return typeof empty === "string" ? (
      <EmptyState compact title={empty} />
    ) : (
      <>{empty}</>
    );
  }

  const cellPad = DENSITY_CELL[density];
  const headerTone = module ? MODULE_HEADER[module] : "text-text";

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-left text-style-caption">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead
          className={cn(
            "bg-panelHi/60 text-style-label",
            headerTone,
            stickyHeader && "sticky top-0 z-sticky",
          )}
        >
          <tr className="border-b border-line">
            {columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  cellPad,
                  "font-bold whitespace-nowrap",
                  col.numeric && "text-right tabular-nums",
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line text-text">
          {rows.map((row, rowIndex) => {
            const key = getRowKey(row, rowIndex);
            const interactive = Boolean(onRowClick);
            return (
              <tr
                key={key}
                onClick={
                  onRowClick ? () => onRowClick(row, rowIndex) : undefined
                }
                className={cn(
                  zebra && rowIndex % 2 === 1 && "bg-panelHi/30",
                  interactive &&
                    "cursor-pointer transition-colors hover:bg-panelHi/50",
                )}
              >
                {columns.map((col) => {
                  const content = col.cell(row, rowIndex);
                  const cellClass = cn(
                    cellPad,
                    col.numeric && "text-right tabular-nums",
                    col.className,
                  );
                  if (col.rowHeader) {
                    return (
                      <th
                        key={col.id}
                        scope="row"
                        className={cn(cellClass, "font-semibold text-text")}
                      >
                        {content}
                      </th>
                    );
                  }
                  return (
                    <td key={col.id} className={cn(cellClass, "text-subtle")}>
                      {content}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
