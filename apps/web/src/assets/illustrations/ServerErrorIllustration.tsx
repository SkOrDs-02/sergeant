/**
 * @status Active
 * @owner @Skords-01
 *
 * 500 / server-error illustration. A toppled cog + spark conveys
 * "something on our side broke" without being alarmist. Primary
 * strokes use `currentColor`; surfaces use design-token utilities so
 * the artwork inherits the page theme automatically.
 */
import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import type { IllustrationProps } from "./types";

export const ServerErrorIllustration = memo(function ServerErrorIllustration({
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
      className={cn("text-danger-strong", className)}
    >
      {/* Server rack outline */}
      <rect
        x="36"
        y="36"
        width="168"
        height="128"
        rx="18"
        className="fill-panelHi stroke-line"
        strokeWidth="2"
      />
      {/* Rack vents — two faint slats */}
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="56" y1="60" x2="184" y2="60" opacity="0.25" />
        <line x1="56" y1="80" x2="184" y2="80" opacity="0.18" />
      </g>
      {/* Inner status panel — the "screen" of the failed unit */}
      <rect
        x="56"
        y="96"
        width="128"
        height="52"
        rx="10"
        className="fill-danger-soft stroke-danger/40"
        strokeWidth="1.5"
      />
      {/* Cog gear — toppled, primary visual anchor */}
      <g transform="translate(120 122) rotate(15)">
        <path
          d="M0 -22L4 -22L6 -16L11 -14L16 -16L19 -13L17 -8L19 -3L25 -1L25 3L19 5L17 10L19 15L16 18L11 16L6 18L4 24L0 24L-2 18L-7 16L-12 18L-15 15L-13 10L-15 5L-21 3L-21 -1L-15 -3L-13 -8L-15 -13L-12 -16L-7 -14L-2 -16L0 -22Z"
          fill="currentColor"
          opacity="0.85"
        />
        <circle cx="0" cy="1" r="7" className="fill-panel" />
      </g>
      {/* Status lamps — one red, one dim */}
      <circle cx="64" cy="48" r="4" className="fill-danger" opacity="0.85" />
      <circle cx="78" cy="48" r="4" className="fill-muted/60" />
      {/* Spark / pop on the top-right */}
      <path
        d="M186 26L192 16L196 26L208 28L196 32L194 44L188 32L176 30L186 26Z"
        fill="currentColor"
        opacity="0.65"
      />
    </svg>
  );
});
