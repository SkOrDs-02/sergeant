/**
 * Last validated: 2026-07-26
 * Status: Active
 */
import { cn } from "../../lib/ui/cn";

export interface MorphChevronProps {
  /**
   * Drives the rotation. `true` → points down (expanded), `false` → points
   * right (collapsed). A single glyph rotates between the two states rather
   * than swapping `chevron-down`/`chevron-right`, so the transition reads as
   * one continuous motion (V-19 icon morph).
   */
  open: boolean;
  /** Glyph edge length in px. Defaults to 16. */
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/**
 * A chevron that morphs between "collapsed" (▶, points right) and "expanded"
 * (▼, points down) by rotating a single SVG path 90°.
 *
 * Why a dedicated component instead of `<Icon className="rotate-180" />`:
 * - Rotating ONE glyph keeps a stable visual anchor — the vertex stays put
 *   and the arms sweep, which the eye tracks as a single object turning.
 *   Cross-fading two different glyphs (down↔right) instead pops, because the
 *   geometry is not a rotation of each other.
 * - The rotation is `motion-safe` only: users with `prefers-reduced-motion`
 *   get an instant state change (no `transition`), honouring the OS setting
 *   without extra JS.
 *
 * Decorative by default (`aria-hidden`): the expanded/collapsed state is
 * always conveyed by the host control's `aria-expanded`, so the icon must not
 * add a redundant announcement.
 */
export function MorphChevron({
  open,
  size = 16,
  strokeWidth = 2,
  className,
}: MorphChevronProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn(
        "shrink-0 origin-center motion-safe:transition-transform motion-safe:duration-base motion-safe:ease-standard",
        open ? "rotate-90" : "rotate-0",
        className,
      )}
    >
      {/* Base glyph points RIGHT (chevron-right). rotate-90 turns it to DOWN. */}
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}
