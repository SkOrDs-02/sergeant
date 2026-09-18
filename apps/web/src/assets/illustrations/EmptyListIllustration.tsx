/**
 * @status Active
 * @owner @Skords-01
 *
 * Generic "empty list" illustration — used by `<EmptyState>` when a
 * list, table, or feed has no rows. Painted with `currentColor`
 * (primary outlines) and design-token utilities (`fill-panelHi`,
 * `stroke-line`) so the SVG re-themes through light/dark and module
 * accent context without inline hex.
 */
import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import type { IllustrationProps } from "./types";

export const EmptyListIllustration = memo(function EmptyListIllustration({
  size = 160,
  className,
}: IllustrationProps) {
  return (
    <svg
      width={size}
      height={(size * 5) / 6}
      viewBox="0 0 240 200"
      fill="none"
      role="presentation"
      aria-hidden="true"
      className={cn("text-muted", className)}
    >
      {/* Soft tray underneath — the "shelf" the rows sit on */}
      <rect
        x="20"
        y="48"
        width="200"
        height="124"
        rx="20"
        className="fill-panelHi stroke-line"
        strokeWidth="2"
      />
      {/* Header strip */}
      <rect
        x="36"
        y="64"
        width="80"
        height="10"
        rx="5"
        className="fill-line"
        opacity="0.7"
      />
      <rect
        x="180"
        y="62"
        width="28"
        height="14"
        rx="7"
        fill="currentColor"
        opacity="0.18"
      />
      {/* Three faded list rows — strokes hint at "rows that aren't there yet" */}
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <line x1="36" y1="100" x2="204" y2="100" opacity="0.35" />
        <line x1="36" y1="128" x2="180" y2="128" opacity="0.22" />
        <line x1="36" y1="156" x2="156" y2="156" opacity="0.14" />
      </g>
      {/* Tag mark — what would be the row affordance, ghosted */}
      <rect
        x="36"
        y="92"
        width="14"
        height="14"
        rx="4"
        className="fill-brand-soft stroke-brand-400"
        strokeWidth="1.5"
      />
      {/* Floating sparkle to lift the composition */}
      <path
        d="M196 28L200 20L204 28L212 32L204 36L200 44L196 36L188 32L196 28Z"
        fill="currentColor"
        opacity="0.45"
      />
      <path
        d="M44 24L46 20L48 24L52 26L48 28L46 32L44 28L40 26L44 24Z"
        fill="currentColor"
        opacity="0.3"
      />
    </svg>
  );
});
