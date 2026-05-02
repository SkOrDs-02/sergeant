/**
 * @scaffolded
 * @owner @Skords-01
 * @addedIn 1d443ac1 (feat(web): add UI/UX improvements and new components)
 * @nextStep Wire into module empty-states (Finyk transactions, Fizruk workouts,
 *           Routine habits, Nutrition diary). See docs/design/EMPTY-STATES.md.
 *
 * Scaffolded but not yet imported by any consumer. Do NOT delete as part of
 * dead-code cleanup — see Hard Rule #15 in AGENTS.md.
 */
import { memo } from "react";
import { cn } from "@shared/lib/cn";

interface IllustrationProps {
  className?: string;
  size?: number;
}

/**
 * Module-specific empty state illustrations.
 * SVG-based, responsive, and theme-aware.
 */

export const FinykEmptyIllustration = memo(function FinykEmptyIllustration({
  className,
  size = 120,
}: IllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={cn("text-finyk", className)}
      aria-hidden="true"
    >
      {/* Wallet base */}
      <rect
        x="20"
        y="35"
        width="80"
        height="55"
        rx="12"
        className="fill-finyk-soft dark:fill-finyk/10 stroke-finyk/30"
        strokeWidth="2"
      />
      {/* Wallet flap */}
      <path
        d="M20 47C20 40.373 25.373 35 32 35H88C94.627 35 100 40.373 100 47V55H20V47Z"
        className="fill-finyk/20 dark:fill-finyk/15"
      />
      {/* Card slot */}
      <rect
        x="70"
        y="60"
        width="20"
        height="14"
        rx="3"
        className="fill-panel stroke-finyk/40"
        strokeWidth="1.5"
      />
      {/* Coins floating */}
      <circle
        cx="35"
        cy="25"
        r="10"
        className="fill-brand-100 dark:fill-brand/20 stroke-brand-400"
        strokeWidth="2"
      />
      <text
        x="35"
        y="29"
        textAnchor="middle"
        className="fill-brand-600 dark:fill-brand text-micro font-bold"
      >
        $
      </text>
      <circle
        cx="55"
        cy="18"
        r="8"
        className="fill-teal-100 dark:fill-teal-500/20 stroke-teal-400"
        strokeWidth="1.5"
        opacity="0.7"
      />
      {/* Sparkles */}
      <path
        d="M85 25L87 22L89 25L87 28L85 25Z"
        className="fill-brand-400 motion-safe:animate-pulse"
      />
      <path
        d="M25 70L26.5 68L28 70L26.5 72L25 70Z"
        className="fill-brand-300 motion-safe:animate-pulse"
        style={{ animationDelay: "0.5s" }}
      />
    </svg>
  );
});

export const FizrukEmptyIllustration = memo(function FizrukEmptyIllustration({
  className,
  size = 120,
}: IllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={cn("text-fizruk", className)}
      aria-hidden="true"
    >
      {/* Dumbbell bar */}
      <rect
        x="25"
        y="55"
        width="70"
        height="10"
        rx="5"
        className="fill-line dark:fill-line/60"
      />
      {/* Left weight */}
      <rect
        x="15"
        y="40"
        width="18"
        height="40"
        rx="4"
        className="fill-fizruk-soft dark:fill-fizruk/15 stroke-fizruk/40"
        strokeWidth="2"
      />
      <rect
        x="8"
        y="45"
        width="12"
        height="30"
        rx="3"
        className="fill-fizruk/30 dark:fill-fizruk/20 stroke-fizruk/30"
        strokeWidth="1.5"
      />
      {/* Right weight */}
      <rect
        x="87"
        y="40"
        width="18"
        height="40"
        rx="4"
        className="fill-fizruk-soft dark:fill-fizruk/15 stroke-fizruk/40"
        strokeWidth="2"
      />
      <rect
        x="100"
        y="45"
        width="12"
        height="30"
        rx="3"
        className="fill-fizruk/30 dark:fill-fizruk/20 stroke-fizruk/30"
        strokeWidth="1.5"
      />
      {/* Sweat drops */}
      <ellipse
        cx="60"
        cy="35"
        rx="3"
        ry="5"
        className="fill-teal-300 dark:fill-teal-400/50 motion-safe:animate-bounce"
        style={{ animationDuration: "2s" }}
      />
      <ellipse
        cx="50"
        cy="30"
        rx="2"
        ry="3.5"
        className="fill-teal-200 dark:fill-teal-400/30 motion-safe:animate-bounce"
        style={{ animationDuration: "2.3s", animationDelay: "0.3s" }}
      />
      {/* Floor line */}
      <path
        d="M10 95H110"
        className="stroke-line dark:stroke-line/40"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 4"
      />
    </svg>
  );
});

export const RoutineEmptyIllustration = memo(function RoutineEmptyIllustration({
  className,
  size = 120,
}: IllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={cn("text-routine", className)}
      aria-hidden="true"
    >
      {/* Clipboard */}
      <rect
        x="25"
        y="20"
        width="70"
        height="85"
        rx="8"
        className="fill-panel stroke-line"
        strokeWidth="2"
      />
      {/* Clipboard top */}
      <rect
        x="40"
        y="12"
        width="40"
        height="16"
        rx="4"
        className="fill-routine-surface dark:fill-routine/15 stroke-routine/40"
        strokeWidth="2"
      />
      <circle cx="60" cy="20" r="4" className="fill-routine/50" />
      {/* Empty checklist lines */}
      <g className="stroke-line dark:stroke-line/60" strokeWidth="2">
        <rect x="35" y="40" width="14" height="14" rx="3" />
        <line x1="55" y1="47" x2="85" y2="47" strokeLinecap="round" />
        <rect x="35" y="62" width="14" height="14" rx="3" />
        <line x1="55" y1="69" x2="80" y2="69" strokeLinecap="round" />
        <rect x="35" y="84" width="14" height="14" rx="3" />
        <line x1="55" y1="91" x2="75" y2="91" strokeLinecap="round" />
      </g>
      {/* Decorative star */}
      <path
        d="M100 30L102 26L104 30L100 32L96 30L100 26L100 30Z"
        className="fill-routine/50 motion-safe:animate-pulse"
      />
    </svg>
  );
});

export const NutritionEmptyIllustration = memo(
  function NutritionEmptyIllustration({
    className,
    size = 120,
  }: IllustrationProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        className={cn("text-nutrition", className)}
        aria-hidden="true"
      >
        {/* Plate */}
        <ellipse
          cx="60"
          cy="75"
          rx="45"
          ry="20"
          className="fill-nutrition-soft dark:fill-nutrition/10 stroke-nutrition/30"
          strokeWidth="2"
        />
        <ellipse
          cx="60"
          cy="75"
          rx="35"
          ry="14"
          className="fill-panel stroke-line dark:stroke-line/60"
          strokeWidth="1.5"
        />
        {/* Fork */}
        <g className="stroke-line dark:stroke-line/60" strokeWidth="2">
          <line x1="25" y1="40" x2="25" y2="65" strokeLinecap="round" />
          <line x1="20" y1="40" x2="20" y2="52" strokeLinecap="round" />
          <line x1="30" y1="40" x2="30" y2="52" strokeLinecap="round" />
          <path d="M20 52H30" strokeLinecap="round" />
        </g>
        {/* Knife */}
        <g className="stroke-line dark:stroke-line/60" strokeWidth="2">
          <line x1="95" y1="40" x2="95" y2="65" strokeLinecap="round" />
          <path d="M95 40C100 40 100 50 95 52" strokeLinecap="round" />
        </g>
        {/* Leaf garnish */}
        <path
          d="M55 55C55 50 60 45 65 45C65 50 60 55 55 55Z"
          className="fill-nutrition/40 dark:fill-nutrition/30"
        />
        <path
          d="M60 55L62 48"
          className="stroke-nutrition/60"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Steam/aroma lines */}
        <path
          d="M50 35C50 32 53 32 53 35C53 38 50 38 50 35Z"
          className="stroke-muted/40 motion-safe:animate-pulse"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M60 30C60 27 63 27 63 30C63 33 60 33 60 30Z"
          className="stroke-muted/30 motion-safe:animate-pulse"
          strokeWidth="1.5"
          fill="none"
          style={{ animationDelay: "0.3s" }}
        />
        <path
          d="M70 35C70 32 73 32 73 35C73 38 70 38 70 35Z"
          className="stroke-muted/40 motion-safe:animate-pulse"
          strokeWidth="1.5"
          fill="none"
          style={{ animationDelay: "0.6s" }}
        />
      </svg>
    );
  },
);

/**
 * Generic empty state illustration for non-module contexts.
 */
export const GenericEmptyIllustration = memo(function GenericEmptyIllustration({
  className,
  size = 120,
}: IllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={cn(className)}
      aria-hidden="true"
    >
      {/* Box */}
      <rect
        x="25"
        y="35"
        width="70"
        height="55"
        rx="8"
        className="fill-panelHi stroke-line"
        strokeWidth="2"
      />
      {/* Box opening */}
      <path
        d="M25 50L60 35L95 50"
        className="stroke-line"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M60 35V55"
        className="stroke-line/50"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
      {/* Dust particles */}
      <circle
        cx="45"
        cy="70"
        r="2"
        className="fill-muted/30 motion-safe:animate-pulse"
      />
      <circle
        cx="75"
        cy="65"
        r="1.5"
        className="fill-muted/20 motion-safe:animate-pulse"
        style={{ animationDelay: "0.5s" }}
      />
      <circle
        cx="60"
        cy="75"
        r="1"
        className="fill-muted/25 motion-safe:animate-pulse"
        style={{ animationDelay: "1s" }}
      />
    </svg>
  );
});

export type ModuleIllustration =
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition"
  | "generic";

const ILLUSTRATIONS: Record<
  ModuleIllustration,
  React.ComponentType<IllustrationProps>
> = {
  finyk: FinykEmptyIllustration,
  fizruk: FizrukEmptyIllustration,
  routine: RoutineEmptyIllustration,
  nutrition: NutritionEmptyIllustration,
  generic: GenericEmptyIllustration,
};

export interface ModuleEmptyIllustrationProps extends IllustrationProps {
  module: ModuleIllustration;
}

/**
 * Convenience component that renders the appropriate illustration
 * based on the module name.
 */
export const ModuleEmptyIllustration = memo(function ModuleEmptyIllustration({
  module,
  ...props
}: ModuleEmptyIllustrationProps) {
  const Component = ILLUSTRATIONS[module] || ILLUSTRATIONS.generic;
  return <Component {...props} />;
});
