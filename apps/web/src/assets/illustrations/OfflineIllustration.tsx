/**
 * @status Active
 * @owner @Skords-01
 *
 * Offline illustration — a cloud with a slash, communicating "we can't
 * reach the network right now". Used by the `/offline` page and any
 * `<EmptyState variant="warning">` that needs an offline-flavoured
 * leading visual. All strokes paint with `currentColor`; surfaces use
 * design-token utilities (no inline hex).
 */
import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import type { IllustrationProps } from "./types";

export const OfflineIllustration = memo(function OfflineIllustration({
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
      className={cn("text-warning-strong", className)}
    >
      {/* Background hill — softens the composition */}
      <path
        d="M0 168C40 152 80 168 120 156C160 144 200 168 240 156V200H0V168Z"
        className="fill-warning-soft"
        opacity="0.85"
      />
      {/* Cloud body — soft tint behind the primary outline */}
      <path
        d="M70 124C58 124 48 114 48 102C48 90 58 80 70 80C72 62 88 48 108 48C124 48 138 58 144 72C148 70 152 70 156 70C172 70 184 82 184 98C184 114 172 124 156 124H70Z"
        className="fill-panel stroke-warning"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* Diagonal slash — primary signal of "no connection" */}
      <line
        x1="60"
        y1="50"
        x2="200"
        y2="160"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <line
        x1="60"
        y1="50"
        x2="200"
        y2="160"
        className="stroke-panel"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Wifi waves underneath — ghosted, hinting at "almost there" */}
      <g
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
      >
        <path d="M88 152C100 140 124 140 136 152" />
        <path d="M96 164C104 156 120 156 128 164" opacity="0.8" />
        <circle cx="112" cy="174" r="3" fill="currentColor" />
      </g>
    </svg>
  );
});
