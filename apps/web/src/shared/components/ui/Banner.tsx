import type { HTMLAttributes, ReactNode } from "react";
import type { StatusColor } from "@sergeant/design-tokens";
import { cn } from "@shared/lib/ui/cn";

export type BannerVariant = StatusColor;

// Light-mode pairs follow the soft Badge convention (`bg-{color}-50` +
// `text-{color}-800`) so contrast clears WCAG AA at 14 px (≥ 4.5:1).
// Dark-mode pairs preserve the original tinted-on-dark look but with
// readable foregrounds — the previous `text-emerald-100` / `text-amber-200`
// declarations were applied in *both* modes, which collapsed contrast to
// ~1.05:1 on the light-theme rendering.
// Wave 1b: status variants collapse onto preset-owned `{status}-soft` /
// `{status}-soft-fg` pairs. The foreground is the theme-aware
// `text-{status}-soft-fg` token — deep ink on the pale light/HC surface,
// bright accent on the deep dark surface — replacing the static
// `text-{status}-strong dark:text-{palette}-100` pair (the fixed `-strong`
// hex went sub-AA once HC bumped the `-soft` surface a step darker).
const variants: Record<BannerVariant, string> = {
  info: "border-line bg-panelHi/60 text-text",
  success: "border-success/30 bg-success-soft text-success-soft-fg",
  warning: "border-warning/30 bg-warning-soft text-warning-soft-fg",
  danger: "border-danger/30 bg-danger-soft text-danger-soft-fg",
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
