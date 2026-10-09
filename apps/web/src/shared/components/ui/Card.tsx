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
 *     задається `tone` (або легасі `module`);
 *   - `receipt` - матеріал «край і зріз», лише деталь чека Фініка.
 *
 * @example
 *   <Card>...</Card>
 *   <Card prominence="hero" tone="finyk">...</Card>
 *   <Card prominence="receipt">...</Card>
 *
 * Легасі-пропи (`variant`, `radius`, решта `prominence`) рендерять ту саму
 * панель, щоб екрани, які ще не перероблені PR2-PR6, не розʼїхались. Їх
 * прибирає PR7 разом із call-site-ами.
 */

export type CardModule = "finyk" | "fizruk" | "routine" | "nutrition";

export type CardProminence =
  | "panel"
  | "hero"
  | "receipt"
  /** @deprecated мова H: рендерить `panel`. @removeBy 2026-12-01 */
  | "default"
  /** @deprecated рендерить `panel` із курсором. @removeBy 2026-12-01 */
  | "interactive"
  /** @deprecated рендерить `panel`. @removeBy 2026-12-01 */
  | "flat"
  /** @deprecated рендерить `panel`. @removeBy 2026-12-01 */
  | "elevated"
  /** @deprecated рендерить `panel`. @removeBy 2026-12-01 */
  | "glass"
  /** @deprecated рендерить `panel`. @removeBy 2026-12-01 */
  | "soft"
  /** @deprecated рендерить `hero` (тинт). @removeBy 2026-12-01 */
  | "tinted"
  | "ghost";

/**
 * @deprecated Prefer `prominence` + `tone`. @removeBy 2026-12-01
 */
export type CardVariant =
  | "default"
  | "interactive"
  | "flat"
  | "elevated"
  | "ghost"
  | CardModule
  | `${CardModule}-soft`;

export type CardPadding = "none" | "sm" | "md" | "lg" | "xl";

/** @deprecated мова H: радіус панелі завжди 12 px. @removeBy 2026-12-01 */
export type CardRadius = "md" | "lg" | "xl";

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

const SOFT_VARIANT_RE = /^(finyk|fizruk|routine|nutrition)-soft$/;
const MODULE_VARIANT_RE = /^(finyk|fizruk|routine|nutrition)$/;

type Form = "panel" | "hero" | "receipt" | "ghost";

function resolveForm(
  variant: CardVariant | undefined,
  module: CardModule | undefined,
  prominence: CardProminence | undefined,
): { form: Form; module: CardModule | null; interactive: boolean } {
  if (prominence === "receipt" || prominence === "ghost") {
    return { form: prominence, module: null, interactive: false };
  }
  if (prominence === "hero" || prominence === "tinted") {
    return {
      form: module ? "hero" : "panel",
      module: module ?? null,
      interactive: false,
    };
  }
  if (prominence) {
    return {
      form: "panel",
      module: null,
      interactive: prominence === "interactive",
    };
  }
  if (module) return { form: "hero", module, interactive: false };
  if (variant && MODULE_VARIANT_RE.test(variant)) {
    return { form: "hero", module: variant as CardModule, interactive: false };
  }
  if (variant === "ghost")
    return { form: "ghost", module: null, interactive: false };
  return {
    form: "panel",
    module: null,
    interactive: variant === "interactive" && !SOFT_VARIANT_RE.test(variant),
  };
}

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** @deprecated Prefer `prominence` + `tone`. @removeBy 2026-12-01 */
  variant?: CardVariant | undefined;
  /** Модуль тинту для `hero`. */
  tone?: CardModule | undefined;
  /** @deprecated = `tone`. @removeBy 2026-12-01 */
  module?: CardModule | undefined;
  prominence?: CardProminence | undefined;
  padding?: CardPadding | undefined;
  /** @deprecated ігнорується, радіус панелі 12 px. @removeBy 2026-12-01 */
  radius?: CardRadius | undefined;
  as?: ElementType | undefined;
  children?: ReactNode | undefined;
}

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  {
    className,
    variant,
    tone,
    module,
    prominence,
    padding = "md",
    radius: _radius,
    as: Component = "div",
    children,
    ...props
  },
  ref,
) {
  const {
    form,
    module: hue,
    interactive,
  } = resolveForm(variant, tone ?? module, prominence);

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
        "rounded-xl",
        interactive && "cursor-pointer transition-colors hover:bg-line/40",
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
