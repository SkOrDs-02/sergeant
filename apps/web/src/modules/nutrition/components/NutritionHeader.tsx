import {
  ModuleHeader,
  ModuleHeaderBackButton,
} from "@shared/components/layout";
import { cn } from "@shared/lib/cn";

function AppleBadge() {
  return (
    <div
      className={cn(
        "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
        "bg-gradient-to-br from-lime-100 to-green-100",
        "dark:from-lime-900/40 dark:to-green-900/30",
        "text-nutrition-strong dark:text-nutrition",
        "border border-nutrition-soft-border/60",
        "shadow-sm",
      )}
      aria-hidden
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 11c0 6 4 10 8 10s8-4 8-10" />
        <path d="M12 21V11" />
        <path d="M7 5c0 2 1 3 2 4M17 5c0 2-1 3-2 4" />
        <path d="M7 5c0-1 1-2 2-2s2 1 2 2c0 2-2 4-2 6" />
        <path d="M17 5c0-1-1-2-2-2s-2 1-2 2c0 2 2 4 2 6" />
      </svg>
    </div>
  );
}

interface NutritionHeaderProps {
  busy?: boolean;
  onBackToHub?: () => void;
}

export function NutritionHeader({
  busy: _busy,
  onBackToHub,
}: NutritionHeaderProps) {
  const left =
    typeof onBackToHub === "function" ? (
      <ModuleHeaderBackButton onClick={onBackToHub} />
    ) : (
      <AppleBadge />
    );

  return (
    <ModuleHeader
      module="nutrition"
      left={left}
      title="ХАРЧУВАННЯ"
      subtitle="Мій раціон"
    />
  );
}
