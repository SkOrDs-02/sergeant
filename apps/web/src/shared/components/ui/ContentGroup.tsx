import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/ui/cn";

/**
 * Shared H-language hierarchy for related settings and actions.
 * `bounded` holds one status with the actions that change it; `plain`
 * separates equal-rank information without adding another surface.
 * Data lists, hero cards and receipts keep their own established forms.
 */
export interface ContentGroupProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "ul";
  variant?: "bounded" | "plain";
  children: ReactNode;
}

export function ContentGroup({
  as: Component = "div",
  variant = "plain",
  className,
  children,
  ...props
}: ContentGroupProps) {
  return (
    <Component
      className={cn(
        variant === "bounded" && "rounded-panel border border-line bg-bg p-3",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export interface ContentRowProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "li";
  children: ReactNode;
}

/** A peer row: a hairline between siblings, never a card around each item. */
export function ContentRow({
  as: Component = "div",
  className,
  children,
  ...props
}: ContentRowProps) {
  return (
    <Component
      data-content-row=""
      className={cn(
        "min-w-0 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
