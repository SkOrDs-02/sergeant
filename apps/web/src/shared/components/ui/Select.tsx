import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "../../lib/ui/cn";
import type { FormVariant, SmallMediumLarge } from "./types";
import { fieldFocus } from "./Input";

/**
 * Sergeant Design System — Select
 *
 * Pairs with <Input> — same sizes, same border/focus treatment, so
 * forms stop mixing `h-11 rounded-lg` inputs with ad-hoc `h-10
 * rounded-lg` selects.
 *
 * Keep using the native <select> for accessibility & mobile native
 * pickers; this component is a styled wrapper with a caret affordance.
 */

export type SelectSize = SmallMediumLarge;
export type SelectVariant = FormVariant;

const sizes: Record<SelectSize, string> = {
  sm: "h-9 pl-3 pr-9 text-style-body rounded-lg",
  md: "h-12 pl-4 pr-10 text-style-body rounded-lg",
  lg: "h-12 pl-5 pr-10 text-style-body rounded-lg",
};

/**
 * Мова H (v3.1): ті самі межа, фокус чорнилом і помилка, що в `Input`.
 * Модульного тону фокуса більше немає: hue модуля в контролах знято
 * рішенням власника 2026-10-18, тож проп `accent` прибрано.
 */
const variants: Record<SelectVariant, string> = {
  default: "bg-panelHi border border-control",
  filled: "bg-panelHi border border-transparent focus-visible:bg-panel",
  ghost:
    "bg-transparent border border-transparent hover:bg-panelHi focus-visible:bg-panelHi",
};

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> {
  size?: SelectSize;
  variant?: SelectVariant;
  error?: boolean;
  children?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { className, size = "md", variant = "default", error, children, ...props },
    ref,
  ) {
    return (
      <div className="relative">
        <select
          ref={ref}
          aria-invalid={error ? true : undefined}
          className={cn(
            "w-full appearance-none text-text",
            "outline-none transition-colors duration-base",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            sizes[size],
            variants[variant],
            fieldFocus(error),
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-subtle"
        >
          <path
            d="M5 7l5 6 5-6"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  },
);
