/**
 * Last validated: 2026-10-18
 * Status: Active
 */
import { memo, type ComponentType } from "react";
import { cn } from "@shared/lib/ui/cn";

interface IllustrationProps {
  className?: string;
  size?: number;
}

/**
 * Стримані лінійні ілюстрації для first-run empty-state-ів модулів.
 * Вони пояснюють тип майбутнього запису, а не заповнюють екран декором.
 */
export const FinykEmptyIllustration = memo(function FinykEmptyIllustration({
  className,
  size = 64,
}: IllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={cn(className)}
      aria-hidden="true"
    >
      <path
        d="M15 8h28v37l-4-3-4 3-4-3-4 3-4-3-4 3-4-3V8Z"
        className="fill-panel stroke-text/75"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M22 18h14M22 25h11M22 32h8"
        className="stroke-text/65"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle
        cx="45"
        cy="43"
        r="10"
        className="fill-panel stroke-finyk"
        strokeWidth="2"
      />
      <path
        d="M41 43h8"
        className="stroke-finyk"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
});

export const FizrukEmptyIllustration = memo(function FizrukEmptyIllustration({
  className,
  size = 64,
}: IllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={cn(className)}
      aria-hidden="true"
    >
      <path
        d="M17 30h30"
        className="stroke-text/75"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect
        x="12"
        y="21"
        width="8"
        height="18"
        rx="3"
        className="fill-panel stroke-text/75"
        strokeWidth="2"
      />
      <rect
        x="44"
        y="21"
        width="8"
        height="18"
        rx="3"
        className="fill-panel stroke-text/75"
        strokeWidth="2"
      />
      <circle
        cx="46"
        cy="45"
        r="10"
        className="fill-panel stroke-fizruk"
        strokeWidth="2"
      />
      <path
        d="m41.5 45 3 3 6-7"
        className="stroke-fizruk"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

export const RoutineEmptyIllustration = memo(function RoutineEmptyIllustration({
  className,
  size = 64,
}: IllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={cn(className)}
      aria-hidden="true"
    >
      <rect
        x="9"
        y="16"
        width="22"
        height="22"
        rx="5"
        className="fill-panel stroke-routine"
        strokeWidth="2"
      />
      <path
        d="m15 27 5 5 10-12"
        className="stroke-routine"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M38 22h17M38 30h13M12 47h38"
        className="stroke-text/65"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
});

export const NutritionEmptyIllustration = memo(
  function NutritionEmptyIllustration({
    className,
    size = 64,
  }: IllustrationProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        className={cn(className)}
        aria-hidden="true"
      >
        <circle
          cx="32"
          cy="31"
          r="16"
          className="fill-panel stroke-text/75"
          strokeWidth="2"
        />
        <path
          d="M10 15v14M7 15v7c0 3 6 3 6 0v-7M10 29v20M54 15v34M54 15c-4 2-5 11 0 13"
          className="stroke-text/75"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="44"
          cy="43"
          r="9"
          className="fill-panel stroke-nutrition"
          strokeWidth="2"
        />
        <path
          d="M44 39v8M40 43h8"
          className="stroke-nutrition"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    );
  },
);

/** Generic illustration retained for non-module first-run surfaces. */
export const GenericEmptyIllustration = memo(function GenericEmptyIllustration({
  className,
  size = 64,
}: IllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={cn(className)}
      aria-hidden="true"
    >
      <path
        d="m11 23 21-9 21 9v27H11V23Z"
        className="fill-panel stroke-text/70"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m11 23 21 10 21-10M32 14v19"
        className="stroke-text/55"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
});

export type ModuleIllustration =
  "finyk" | "fizruk" | "routine" | "nutrition" | "generic";

const ILLUSTRATIONS: Record<
  ModuleIllustration,
  ComponentType<IllustrationProps>
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

export const ModuleEmptyIllustration = memo(function ModuleEmptyIllustration({
  module,
  ...props
}: ModuleEmptyIllustrationProps) {
  const Component = ILLUSTRATIONS[module];
  return <Component {...props} />;
});
