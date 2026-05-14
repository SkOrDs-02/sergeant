/**
 * Sergeant Routine — Calendar shared types.
 *
 * Pure type module shared across the `pages/Calendar/` sub-tree.
 * No runtime dependencies — keeps the page-level decomposition
 * (`P2.2b` audit item) cheap to import from any sub-component.
 */

/** Three-state segmented control: focus a day, week, or month. */
export type TimeMode = "today" | "week" | "month";

/** Zero-indexed month cursor (UTC-naïve — month grid is local). */
export interface MonthCursor {
  y: number;
  m: number;
}
