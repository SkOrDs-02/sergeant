/**
 * Sergeant Design System — Banner (React Native)
 *
 * Mobile port of the web `Banner` primitive. Banners communicate a
 * non-blocking status / context message above a section of content
 * (empty-state hints, sync issues, quick callouts).
 *
 * @see apps/web/src/shared/components/ui/Banner.tsx — canonical source of truth
 *
 * Parity notes:
 * - Same `BannerVariant` enum (`info` / `success` / `warning` / `danger`).
 * - Same external API: `variant`, `className`, `children`, and
 *   spread-through for extra RN props (`accessibilityRole` etc.).
 * - Same layout tokens: rounded-2xl, border, `px-4 py-3`, small body
 *   text, variant-keyed border + background + foreground colours.
 *
 * Differences from web (intentional):
 * - Spreads over `ViewProps` instead of `HTMLAttributes<HTMLDivElement>`
 *   — no `onClick`, `role`, `aria-*`; the RN analogues are
 *   `accessibilityRole` / `accessibilityLabel` / `accessibilityState`.
 * - Children render inside a `Text`-free `View`. Callers pass `<Text>`
 *   elements when they want text content — the banner still supplies
 *   the text colour class via `ClassContext` would be ideal, but
 *   NativeWind v4 doesn't inherit colour through nested `Text` on RN.
 *   For now we just apply the variant colour token to the wrapper; most
 *   call sites pass a single `<Text>` child that can read the same
 *   colour off the surrounding theme.
 * - Semantic tokens (`border-line`, `bg-panelHi`, `text-text`,
 *   `bg-danger`) now resolve through CSS variables in `global.css`.
 */

import type { ReactNode } from "react";
import type { StatusColor } from "@sergeant/design-tokens";
import { View, type ViewProps } from "react-native";

export type BannerVariant = StatusColor;

const variants: Record<BannerVariant, string> = {
  info: "border-cream-300 bg-cream-100",
  success: "border-emerald-300 bg-emerald-50",
  warning: "border-amber-300 bg-amber-50",
  danger: "border-red-300 bg-red-50",
};

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface BannerProps extends ViewProps {
  variant?: BannerVariant;
  children?: ReactNode;
  className?: string;
}

export function Banner({
  variant = "info",
  className,
  children,
  ...props
}: BannerProps) {
  return (
    <View
      accessibilityRole="alert"
      className={cx(
        "rounded-2xl border px-4 py-3",
        variants[variant] ?? variants.info,
        className,
      )}
      {...props}
    >
      {children}
    </View>
  );
}
