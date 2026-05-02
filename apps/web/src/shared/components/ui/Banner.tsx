import type { HTMLAttributes, ReactNode } from "react";
import type { StatusColor } from "@sergeant/design-tokens";
import { cn } from "@shared/lib/cn";

export type BannerVariant = StatusColor;

// Light-mode pairs follow the soft Badge convention (`bg-{color}-50` +
// `text-{color}-800`) so contrast clears WCAG AA at 14 px (≥ 4.5:1).
// Dark-mode pairs preserve the original tinted-on-dark look but with
// readable foregrounds — the previous `text-emerald-100` / `text-amber-200`
// declarations were applied in *both* modes, which collapsed contrast to
// ~1.05:1 on the light-theme rendering.
// Wave 1b: status variants collapse onto preset-owned `{status}-soft` /
// `{status}-strong` pairs; the `--c-{status}-soft` CSS variables carry
// the light/dark swap so `dark:` palette patches are no longer needed.
// `dark:text-{palette}-100` retained because the `-strong` companion is
// tuned for cream/white backgrounds and reads too dim on the dark soft
// surface — the lighter `-100` shade keeps body copy legible there.
const variants: Record<BannerVariant, string> = {
  info: "border-line bg-panelHi/60 text-text",
  success:
    "border-success/30 bg-success-soft text-success-strong dark:text-emerald-100",
  warning:
    "border-warning/30 bg-warning-soft text-warning-strong dark:text-amber-100",
  danger:
    "border-danger/30 bg-danger-soft text-danger-strong dark:text-red-100",
};

export interface BannerProps extends HTMLAttributes<HTMLDivElement> {
  variant?: BannerVariant;
  children?: ReactNode;
}

export function Banner({
  variant = "info",
  className,
  children,
  ...props
}: BannerProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm",
        variants[variant] || variants.info,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
