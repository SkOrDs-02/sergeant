import type { SVGAttributes } from "react";
import { cn } from "@shared/lib/ui/cn";

/**
 * Sergeant Design System — Spinner
 *
 * Canonical loading spinner used by {@link Button} (via its `loading`
 * prop), inline fetch states, and skeleton overlays. Kept as a separate
 * primitive so ad-hoc `<svg className="animate-spin ...">` blocks
 * scattered across modules can migrate to a single visual language.
 *
 * The spinner is visually decorative (`aria-hidden`). Pair it with an
 * `aria-live="polite"` status message or an `sr-only` label for screen
 * readers.
 */

export type SpinnerSize = "xs" | "sm" | "md" | "lg";

const sizes: Record<SpinnerSize, string> = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

export interface SpinnerProps extends SVGAttributes<SVGSVGElement> {
  size?: SpinnerSize;
}

export function Spinner({ className, size = "sm", ...props }: SpinnerProps) {
  // Wrap the <svg> in a <div> that carries `animate-spin`: CSS animations on
  // SVG elements are often not hardware-accelerated in Chromium/WebKit, so
  // animating the wrapper keeps the transform on the compositor thread.
  // See `.agents/skills/sergeant-web-ui/SKILL.md`.
  return (
    <div
      aria-hidden="true"
      className={cn(
        "inline-block motion-safe:animate-spin",
        sizes[size],
        className,
      )}
    >
      <svg
        focusable="false"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="h-full w-full"
        {...props}
      >
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    </div>
  );
}
