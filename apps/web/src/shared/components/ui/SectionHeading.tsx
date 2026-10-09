import { type ElementType, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System - SectionHeading (мова H, redesign v3).
 *
 * - `lg` - заголовок секції 20 / 700, чорнилом. З `variant="muted"` - 16 / 700
 *   другим сірим: для «Закрито» й «Будь-коли».
 * - `xs` - ярлик 12 / 600 / caps третім сірим (над числом, у шапці блока).
 *   Кікера з вертикальною рискою більше немає.
 * - `md` - 14 / 600, `xl` - заголовок екрана 26 / 700.
 *
 * Праворуч опційно `meta` (лічильник або мета третім сірим) або `action`.
 */
export type SectionHeadingSize = "xs" | "md" | "lg" | "xl";

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
  "normal" | "medium" | "semibold" | "bold" | "extrabold";

const sizeTokens: Record<SectionHeadingSize, string> = {
  xs: "text-style-overline",
  md: "text-style-label",
  lg: "text-style-title",
  xl: "text-style-headline",
};

const weightTokens: Record<SectionHeadingWeight, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
  extrabold: "font-extrabold",
};

const defaultWeightForSize: Record<SectionHeadingSize, SectionHeadingWeight> = {
  xs: "semibold",
  md: "semibold",
  lg: "bold",
  xl: "bold",
};

// Мова H: hue модуля лише в даних. Модульні варіанти лишились як API для
// call-site-ів, але рендерять нейтральний сірий ярлик.
const variants: Record<SectionHeadingVariant, string> = {
  subtle: "text-subtle",
  muted: "text-muted",
  text: "text-text",
  accent: "text-text",
  finyk: "text-subtle",
  fizruk: "text-subtle",
  routine: "text-subtle",
  nutrition: "text-subtle",
};

const defaultVariantForSize: Record<SectionHeadingSize, SectionHeadingVariant> =
  {
    xs: "subtle",
    md: "text",
    lg: "text",
    xl: "text",
  };

export interface SectionHeadingProps extends HTMLAttributes<HTMLElement> {
  size?: SectionHeadingSize;
  variant?: SectionHeadingVariant;
  weight?: SectionHeadingWeight;
  as?: ElementType;
  /** Лічильник або мета праворуч, третім сірим. */
  meta?: ReactNode;
  /** Дія праворуч. */
  action?: ReactNode;
  children?: ReactNode;
  /** When `as="button"`, allow specifying the button type. */
  type?: "button" | "submit" | "reset";
  /** When `as="button"`, allow disabling. */
  disabled?: boolean;
}

export function SectionHeading({
  className,
  size = "xs",
  variant,
  weight,
  as: Component = "h3",
  meta,
  action,
  children,
  ...props
}: SectionHeadingProps) {
  const resolvedVariant = variant ?? defaultVariantForSize[size];
  const mutedSection = size === "lg" && resolvedVariant === "muted";
  const base = cn(
    mutedSection ? "text-style-label-lg" : sizeTokens[size],
    weightTokens[weight ?? defaultWeightForSize[size]],
    variants[resolvedVariant],
  );

  const aside =
    meta != null || action != null ? (
      <div className="flex shrink-0 items-center gap-2">
        {meta != null && (
          <span className="text-style-label tnum text-subtle">{meta}</span>
        )}
        {action}
      </div>
    ) : null;

  if (aside) {
    return (
      <div
        className={cn("flex items-baseline justify-between gap-3", className)}
      >
        <Component className={base} {...props}>
          {children}
        </Component>
        {aside}
      </div>
    );
  }

  return (
    <Component className={cn(base, className)} {...props}>
      {children}
    </Component>
  );
}
