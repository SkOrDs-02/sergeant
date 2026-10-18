import {
  forwardRef,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System - Card (мова H, redesign v3).
 *
 * Картка це панель: `bg-panel`, радіус 12, без бордера й тіні. Три форми:
 *   - `panel` (дефолт) - групує список або блок;
 *   - `hero` - тинт модуля, рівно одна поверхня на екран (H.2); модуль
 *     задається `tone`;
 *   - `receipt` - матеріал «край і зріз», лише деталь чека Фініка.
 *
 * @example
 *   <Card>...</Card>
 *   <Card prominence="hero" tone="finyk">...</Card>
 *   <Card prominence="receipt">...</Card>
 *
 */

export type CardModule = "finyk" | "fizruk" | "routine" | "nutrition";

export type CardProminence = "panel" | "hero" | "receipt" | "ghost";
export type CardPadding = "none" | "sm" | "md" | "lg" | "xl";

const paddings: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
  xl: "p-6",
};

const TINT: Record<CardModule, string> = {
  finyk: "bg-finyk-tint",
  fizruk: "bg-fizruk-tint",
  routine: "bg-routine-tint",
  nutrition: "bg-nutrition-tint",
};

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Модуль тинту для `hero`. */
  tone?: CardModule | undefined;
  prominence?: CardProminence | undefined;
  padding?: CardPadding | undefined;
  as?: ElementType | undefined;
  children?: ReactNode | undefined;
}

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  {
    className,
    tone,
    prominence = "panel",
    padding = "md",
    as: Component = "div",
    children,
    ...props
  },
  ref,
) {
  const form = prominence;
  const hue = tone;

  if (form === "receipt") {
    /*
      Чек: лінійка зверху й відривний низ (`edge-stub`). Перфорація
      вирізається маскою, а маска зрізає тінь на своєму вузлі, тому підйом
      (`edge-lift`) живе на зовнішньому вузлі викликача, а поверхня з маскою
      всередині.
    */
    return (
      <Component ref={ref} className="edge-lift" {...props}>
        <div className={cn("bg-panel edge-stub", paddings[padding], className)}>
          {children}
        </div>
      </Component>
    );
  }

  return (
    <Component
      ref={ref}
      className={cn(
        form === "ghost"
          ? "bg-transparent"
          : form === "hero" && hue
            ? TINT[hue]
            : "bg-panel",
        "rounded-panel",
        paddings[padding],
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
});

/**
 * CardHeader — Consistent header section for cards
 */
export function CardHeader({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-between mb-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardTitleProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
}

/**
 * CardTitle — Title text for cards
 */
export function CardTitle({
  className,
  as: Component = "h3",
  ...props
}: CardTitleProps) {
  return (
    <Component
      className={cn("text-style-title font-semibold text-text", className)}
      {...props}
    />
  );
}

/**
 * CardDescription — Secondary text for cards
 */
export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-style-body text-muted mt-1", className)}
      {...props}
    />
  );
}

/**
 * CardContent — Main content area with optional overflow handling
 */
export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("", className)} {...props} />;
}

/**
 * CardFooter — Footer section for actions
 */
export function CardFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 mt-4 pt-4 border-t border-line",
        className,
      )}
      {...props}
    />
  );
}
