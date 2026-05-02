import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import type { FormVariant, SmallMediumLarge } from "./types";

/**
 * Sergeant Design System — Select
 *
 * Pairs with <Input> — same sizes, same border/focus treatment, so
 * forms stop mixing `h-11 rounded-2xl` inputs with ad-hoc `h-10
 * rounded-xl` selects.
 *
 * Keep using the native <select> for accessibility & mobile native
 * pickers; this component is a styled wrapper with a caret affordance.
 */

export type SelectSize = SmallMediumLarge;
export type SelectVariant = FormVariant;

const sizes: Record<SelectSize, string> = {
  sm: "h-9 pl-3 pr-9 text-sm rounded-xl",
  md: "h-11 pl-4 pr-10 text-base rounded-2xl",
  lg: "h-12 pl-5 pr-10 text-base rounded-2xl",
};

/**
 * Focus treatment — mirrors `Input` and `Button`: keyboard focus shows a
 * `focus-visible:ring-2 ring-brand-500/30` ring, pointer clicks don't.
 */
const variants: Record<SelectVariant, string> = {
  default:
    "bg-panelHi border border-line focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500/30",
  filled:
    "bg-panelHi border-transparent focus-visible:bg-panel focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500/30",
  ghost:
    "bg-transparent border-transparent hover:bg-panelHi focus-visible:bg-panelHi focus-visible:ring-2 focus-visible:ring-brand-500/30",
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
    const stateClass = error
      ? "border-danger/70 focus-visible:border-danger focus-visible:ring-danger/25"
      : "";

    return (
      <div className="relative">
        <select
          ref={ref}
          aria-invalid={error ? true : undefined}
          className={cn(
            "w-full appearance-none text-text",
            "outline-none transition-colors duration-200",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            sizes[size],
            variants[variant],
            stateClass,
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted"
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
