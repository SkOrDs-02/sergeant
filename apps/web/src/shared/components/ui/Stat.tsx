import { type ReactNode } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { cn } from "../../lib/ui/cn";

/**
 * Sergeant Design System — Stat
 *
 * The canonical "eyebrow + big number + sublabel" triple that repeats
 * dozens of times across Fizruk dashboards and Finyk summaries:
 *
 *   <SectionHeading as="div" size="xs">Вага</SectionHeading>
 *   <div className="text-2xl font-extrabold text-text mt-1 tabular-nums">82 кг</div>
 *   <div className="text-xs text-subtle mt-1">+0.4 кг</div>
 *
 * `variant` tints the value (see `docs/design/COMPONENT_API.md`): default
 * (text-text), success, warning, danger, and each module's brand token
 * (finyk/fizruk/routine/nutrition) for the rare branded metric readouts.
 */

export type StatVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition";

export type StatSize = "sm" | "md" | "lg";

// `text-{c}-strong` (= `[700]`, lime-800 for nutrition) keeps Stat
// numbers readable at body sizes against cream `bg-bg`. The previous
// `text-{c}` (= `[500]`) only cleared ~2.4:1 — the `text-2xl` size
// nominally exempts it from the 4.5:1 rule (large-text 3:1), but the
// nested `<span>` value isn't `font-bold`, so axe applies the regular
// threshold. See docs/design/brand-palette-wcag-aa-proposal.md.
const variantClass: Record<StatVariant, string> = {
  default: "text-text",
  success: "text-success-strong",
  warning: "text-warning-strong",
  danger: "text-danger-strong",
  finyk: "text-finyk-strong",
  fizruk: "text-fizruk-strong",
  routine: "text-routine-strong",
  nutrition: "text-nutrition-strong",
};

const valueSize: Record<StatSize, string> = {
  sm: "text-lg font-extrabold tabular-nums",
  md: "text-2xl font-extrabold tabular-nums",
  lg: "text-3xl font-black tabular-nums",
};

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  sublabel?: ReactNode;
  /** Colour variant for the value. Defaults to `default` (text-text). */
  variant?: StatVariant;
  size?: StatSize;
  /** Optional leading icon / emoji rendered left of the value. */
  icon?: ReactNode;
  /** Align contents. Defaults to left. */
  align?: "left" | "center" | "right";
  className?: string;
}

export function Stat({
  label,
  value,
  sublabel,
  variant = "default",
  size = "md",
  icon,
  align = "left",
  className,
}: StatProps) {
  const alignClass =
    align === "center"
      ? "text-center"
      : align === "right"
        ? "text-right"
        : "text-left";

  return (
    <div className={cn(alignClass, className)}>
      <SectionHeading as="div" size="xs">
        {label}
      </SectionHeading>
      <div
        className={cn(
          "mt-1 flex items-baseline gap-1.5",
          align === "center" && "justify-center",
          align === "right" && "justify-end",
          valueSize[size],
          variantClass[variant],
        )}
      >
        {icon && (
          <span className="text-base font-normal leading-none">{icon}</span>
        )}
        <span>{value}</span>
      </div>
      {sublabel && <div className="text-xs text-subtle mt-1">{sublabel}</div>}
    </div>
  );
}
