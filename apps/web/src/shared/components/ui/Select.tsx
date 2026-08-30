import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "../../lib/ui/cn";
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
export type SelectAccent =
  "brand" | "finyk" | "fizruk" | "nutrition" | "routine";

const sizes: Record<SelectSize, string> = {
  sm: "h-9 pl-3 pr-9 text-style-body rounded-xl",
  md: "h-11 pl-4 pr-10 text-style-body rounded-2xl",
  lg: "h-12 pl-5 pr-10 text-style-body rounded-2xl",
};

const variants: Record<SelectVariant, string> = {
  default: "bg-panelHi border border-line",
  filled: "bg-panelHi border-transparent focus-visible:bg-panel",
  ghost:
    "bg-transparent border-transparent hover:bg-panelHi focus-visible:bg-panelHi",
};

/**
 * Focus treatment — mirrors `Input` and `Button`: keyboard focus shows a
 * `focus-visible:ring-2 ring-focus/30` ring (Hard Rule #14), pointer
 * clicks don't.
 */
const brandFocus: Record<SelectVariant, string> = {
  default:
    "focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-focus/30",
  filled:
    "focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-focus/30",
  ghost: "focus-visible:ring-2 focus-visible:ring-focus/30",
};

/**
 * AI-CONTEXT: `accent` існує через правило module-accent containment
 * (дизайн-конвенція, ex-Rule #12): усередині піддерева модуля фокус-ринг
 * має бути модульного тону, а не бренд-фіолетовим — саме тому 11 з 15
 * raw `<select>` у модулях історично обходили цей компонент через
 * `input-focus-<module>` / `routine-touch-select` з utilities.css.
 * Для не-brand акценту застосовуємо готову утиліту `input-focus-<module>`
 * (вона несе і focus-border, і ring) ЗАМІСТЬ бренд-фокусних класів —
 * інакше ringʼи стакаються, бо tailwind-merge не бачить всередину
 * `@utility`. `error` має пріоритет над акцентом: danger-ринг один на всіх.
 */
const accentFocus: Record<Exclude<SelectAccent, "brand">, string> = {
  finyk: "input-focus-finyk",
  fizruk: "input-focus-fizruk",
  nutrition: "input-focus-nutrition",
  routine: "input-focus-routine",
};

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> {
  size?: SelectSize;
  variant?: SelectVariant;
  /** Модульний тон focus-ring; за замовчуванням — бренд (як в `Input`). */
  accent?: SelectAccent;
  error?: boolean;
  children?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    {
      className,
      size = "md",
      variant = "default",
      accent = "brand",
      error,
      children,
      ...props
    },
    ref,
  ) {
    const stateClass = error
      ? "border-danger/70 focus-visible:border-danger focus-visible:ring-danger/25"
      : "";
    // При error лишаємо бренд-фокусний набір: stateClass перекриває його
    // через tailwind-merge (last-wins) до danger-тону, тож error виглядає
    // однаково для всіх акцентів і ринг рівно один.
    const focusClass =
      accent === "brand" || error ? brandFocus[variant] : accentFocus[accent];

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
            focusClass,
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
