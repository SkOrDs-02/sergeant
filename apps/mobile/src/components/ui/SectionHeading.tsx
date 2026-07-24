/**
 * Sergeant Design System — SectionHeading (React Native)
 *
 * Mobile port of the web `SectionHeading` primitive.
 *
 * @see apps/web/src/shared/components/ui/SectionHeading.tsx — canonical source of truth
 *
 * Parity notes:
 * - Same `SectionHeadingSize` (xs/sm/md/lg/xl) and `SectionHeadingVariant`
 *   (subtle/muted/text/accent + four module tints).
 * - Same `weight` prop (semibold/bold/extrabold) with the same size-keyed
 *   defaults.
 *
 * Differences from web (intentional):
 * - Renders as a single `<Text>` (RN has no semantic heading tag; screen
 *   readers announce the `accessibilityRole="header"` supplied here).
 * - No `as` / `action` slot — RN callers compose the trailing action in
 *   their own <View className="flex-row"> sibling if needed.
 */

import type { ReactNode } from "react";
import { Text, type TextProps } from "react-native";

export type SectionHeadingSize = "2xs" | "xs" | "sm" | "md" | "lg" | "xl";

export type SectionHeadingVariant =
  | "subtle"
  | "muted"
  | "text"
  | "accent"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition";

export type SectionHeadingWeight =
  | "normal"
  | "medium"
  | "semibold"
  | "bold"
  | "extrabold";

// This IS the SectionHeading primitive itself — canonical owner of the
// uppercase + tracking + text-* eyebrow combo. Raw-className call-sites
// elsewhere must still go through <SectionHeading>. This file is on the
// `no-eyebrow-drift` allowlist (see `eslint.config.js`); per-line disables
// are not needed here. The `2xs` step is the mobile-side mirror of the
// web addition — covers compact eyebrows on hub-dashboard cards, FTUX
// hero, sheet sub-headers, and weekly-digest module subheadings
// (formerly `text-[10px]`/`text-[11px]`/`text-2xs` raw className
// triplets).
const sizeTokens: Record<SectionHeadingSize, string> = {
  "2xs": "text-2xs uppercase tracking-wide",
  xs: "text-xs uppercase tracking-wider",
  sm: "text-xs uppercase tracking-widest",
  md: "text-sm",
  lg: "text-lg leading-tight",
  xl: "text-xl leading-tight",
};

const weightTokens: Record<SectionHeadingWeight, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
  extrabold: "font-extrabold",
};

const defaultWeightForSize: Record<SectionHeadingSize, SectionHeadingWeight> = {
  "2xs": "bold",
  xs: "bold",
  sm: "bold",
  md: "semibold",
  lg: "extrabold",
  xl: "extrabold",
};

const variants: Record<SectionHeadingVariant, string> = {
  subtle: "text-subtle",
  muted: "text-muted",
  text: "text-text",
  accent: "text-brand-strong",
  finyk: "text-finyk-strong dark:text-finyk/70",
  fizruk: "text-fizruk-strong dark:text-fizruk/70",
  routine: "text-routine-strong dark:text-routine/70",
  nutrition: "text-nutrition-strong dark:text-nutrition/70",
};

const defaultVariantForSize: Record<SectionHeadingSize, SectionHeadingVariant> =
  {
    "2xs": "subtle",
    xs: "subtle",
    sm: "subtle",
    md: "text",
    lg: "text",
    xl: "text",
  };

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface SectionHeadingProps extends TextProps {
  size?: SectionHeadingSize;
  variant?: SectionHeadingVariant;
  weight?: SectionHeadingWeight;
  children?: ReactNode;
  className?: string;
}

export function SectionHeading({
  size = "xs",
  variant,
  weight,
  className,
  children,
  ...props
}: SectionHeadingProps) {
  const resolvedVariant = variant ?? defaultVariantForSize[size];
  const resolvedWeight = weight ?? defaultWeightForSize[size];

  return (
    <Text
      accessibilityRole="header"
      className={cx(
        sizeTokens[size],
        weightTokens[resolvedWeight],
        variants[resolvedVariant],
        className,
      )}
      {...props}
    >
      {children}
    </Text>
  );
}

export const SectionHeader = SectionHeading;
export type SectionHeaderProps = SectionHeadingProps;
export type SectionHeaderSize = SectionHeadingSize;
export type SectionHeaderVariant = SectionHeadingVariant;
export type SectionHeaderWeight = SectionHeadingWeight;
