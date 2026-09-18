/**
 * @status Active
 * @owner @Skords-01
 *
 * "No results" illustration — used when a search / filter returns zero
 * matches (distinct from "no data yet"). The magnifier paints with
 * `currentColor`; the result panel and tags use design-token utilities
 * so the artwork inherits the surrounding theme.
 */
import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import type { IllustrationProps } from "./types";

export const NoResultsIllustration = memo(function NoResultsIllustration({
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
      className={cn("text-brand-500", className)}
    >
      {/* Result panel — what the search would have populated */}
      <rect
        x="30"
        y="40"
        width="180"
        height="130"
        rx="20"
        className="fill-panelHi stroke-line"
        strokeWidth="2"
      />
      {/* Search field at the top of the panel */}
      <rect
        x="46"
        y="56"
        width="148"
        height="22"
        rx="11"
        className="fill-panel stroke-line"
        strokeWidth="1.5"
      />
      <circle cx="58" cy="67" r="3.5" className="fill-muted/70" />
      <rect
        x="68"
        y="64"
        width="80"
        height="6"
        rx="3"
        className="fill-muted/40"
      />
      {/* Ghost rows — strokes only, indicating "nothing matched" */}
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <line x1="46" y1="100" x2="180" y2="100" opacity="0.25" />
        <line x1="46" y1="124" x2="156" y2="124" opacity="0.18" />
        <line x1="46" y1="148" x2="132" y2="148" opacity="0.12" />
      </g>
      {/* Magnifier — primary visual anchor */}
      <g
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <circle cx="156" cy="124" r="34" className="fill-brand-soft" />
        <line x1="184" y1="152" x2="208" y2="176" />
      </g>
      {/* Empty-state cross inside the glass — gentle, not aggressive */}
      <g
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.55"
      >
        <line x1="144" y1="112" x2="168" y2="136" />
        <line x1="168" y1="112" x2="144" y2="136" />
      </g>
    </svg>
  );
});
