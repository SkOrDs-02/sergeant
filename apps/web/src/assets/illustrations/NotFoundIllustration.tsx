/**
 * @status Active
 * @owner @Skords-01
 *
 * 404 / page-not-found illustration. A compass with a misaligned
 * needle suggests "we lost our way" in a calm, on-brand way. Primary
 * geometry paints with `currentColor`; surfaces use design-token
 * utilities so the illustration recolours with the surrounding theme.
 */
import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import type { IllustrationProps } from "./types";

export const NotFoundIllustration = memo(function NotFoundIllustration({
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
      {/* Map paper backdrop */}
      <path
        d="M30 56L96 40L160 56L210 40V160L144 176L80 160L30 176V56Z"
        className="fill-panelHi stroke-line"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Fold lines */}
      <g
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.35"
      >
        <line x1="96" y1="40" x2="96" y2="160" />
        <line x1="160" y1="56" x2="160" y2="176" />
      </g>
      {/* Dashed route — getting lost */}
      <path
        d="M52 132C76 116 100 124 124 100C148 76 168 92 188 72"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 6"
        opacity="0.65"
        fill="none"
      />
      {/* Compass / pin — primary anchor */}
      <g transform="translate(140 108)">
        <circle
          r="32"
          className="fill-brand-soft stroke-brand-500"
          strokeWidth="3"
        />
        <circle r="3" fill="currentColor" />
        {/* Needle (slightly off-true-north, communicating "we lost it") */}
        <path d="M-2 -22L2 -22L4 0L-4 0L-2 -22Z" fill="currentColor" />
        <path d="M-4 0L4 0L2 22L-2 22L-4 0Z" className="fill-muted/70" />
        {/* Cardinal tick marks */}
        <g
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.5"
        >
          <line x1="0" y1="-28" x2="0" y2="-24" />
          <line x1="0" y1="24" x2="0" y2="28" />
          <line x1="-28" y1="0" x2="-24" y2="0" />
          <line x1="24" y1="0" x2="28" y2="0" />
        </g>
      </g>
      {/* "X marks the spot" — the page that never existed */}
      <g
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.7"
      >
        <line x1="62" y1="64" x2="74" y2="76" />
        <line x1="74" y1="64" x2="62" y2="76" />
      </g>
    </svg>
  );
});
