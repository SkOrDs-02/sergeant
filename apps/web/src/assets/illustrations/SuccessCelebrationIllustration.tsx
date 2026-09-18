/**
 * @status Active
 * @owner @Skords-01
 *
 * Success / celebration illustration — a check inside a soft burst,
 * surrounded by confetti dots. Used by `<EmptyState variant="success">`
 * for "you've finished everything" empty states. Strokes paint with
 * `currentColor`; surfaces use design-token utilities so the burst
 * lifts the surrounding theme rather than fighting it.
 */
import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import type { IllustrationProps } from "./types";

export const SuccessCelebrationIllustration = memo(
  function SuccessCelebrationIllustration({
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
        className={cn("text-success-strong", className)}
      >
        {/* Soft glow underlay */}
        <ellipse
          cx="120"
          cy="170"
          rx="92"
          ry="14"
          className="fill-success-soft"
          opacity="0.65"
        />
        {/* Burst rays */}
        <g
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.5"
        >
          <line x1="120" y1="22" x2="120" y2="40" />
          <line x1="40" y1="100" x2="58" y2="100" />
          <line x1="200" y1="100" x2="182" y2="100" />
          <line x1="60" y1="44" x2="72" y2="56" />
          <line x1="180" y1="44" x2="168" y2="56" />
          <line x1="60" y1="156" x2="72" y2="144" />
          <line x1="180" y1="156" x2="168" y2="144" />
        </g>
        {/* Central disc */}
        <circle
          cx="120"
          cy="100"
          r="48"
          className="fill-success-soft stroke-success"
          strokeWidth="3"
        />
        <circle
          cx="120"
          cy="100"
          r="36"
          className="fill-success"
          opacity="0.18"
        />
        {/* Check mark — anchored with currentColor */}
        <path
          d="M100 102L116 118L142 88"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Confetti pieces in module-accent hues — paired -strong/-soft for tone */}
        <rect
          x="50"
          y="36"
          width="8"
          height="14"
          rx="2"
          className="fill-brand-500"
          transform="rotate(-18 54 43)"
          opacity="0.85"
        />
        <rect
          x="186"
          y="48"
          width="10"
          height="6"
          rx="2"
          className="fill-routine"
          transform="rotate(22 191 51)"
          opacity="0.85"
        />
        <circle cx="200" cy="140" r="4" className="fill-fizruk" />
        <circle cx="46" cy="138" r="3" className="fill-nutrition" />
        <path
          d="M170 24L174 16L178 24L186 26L178 30L174 38L170 30L162 28L170 24Z"
          fill="currentColor"
          opacity="0.4"
        />
        <path
          d="M62 168L66 162L70 168L74 170L70 174L66 180L62 174L58 170L62 168Z"
          fill="currentColor"
          opacity="0.3"
        />
      </svg>
    );
  },
);
