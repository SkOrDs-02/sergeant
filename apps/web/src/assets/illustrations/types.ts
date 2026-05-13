/**
 * @status Active
 * @owner @Skords-01
 *
 * Shared types for the illustration set used by `<EmptyState>` and the
 * `/404` / `/500` / `/offline` error pages. Per the design system rule
 * (no hex anywhere), every illustration must paint with `currentColor`
 * and the registered Tailwind token utilities so it recolours through
 * light/dark and module-accent context automatically.
 */

export interface IllustrationProps {
  /** Square size in CSS px. Defaults to 120 (matches the EmptyState md icon block). */
  size?: number;
  /**
   * Optional className applied to the root `<svg>`. Use it to pin the
   * leading hue with a `text-*` token — every illustration paints its
   * primary lines with `currentColor` so the wrapping `text-*` token
   * controls the dominant accent.
   */
  className?: string;
}
