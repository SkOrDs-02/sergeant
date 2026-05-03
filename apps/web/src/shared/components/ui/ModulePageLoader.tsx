import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Skeleton, SkeletonText } from "./Skeleton";

type ModuleType = "finyk" | "fizruk" | "routine" | "nutrition" | "generic";

interface ModulePageLoaderProps {
  module?: ModuleType;
  className?: string;
}

/**
 * Module-specific skeleton loader that mimics the actual page layout.
 * Each module gets a unique skeleton structure that matches its UI.
 */
export const ModulePageLoader = memo(function ModulePageLoader({
  module = "generic",
  className,
}: ModulePageLoaderProps) {
  const Loader = LOADERS[module] || GenericLoader;
  return (
    <div
      className={cn(
        "p-4 space-y-4 motion-safe:animate-in motion-safe:fade-in skeleton-stagger",
        className,
      )}
      aria-busy="true"
      aria-label="Завантаження…"
    >
      <Loader />
    </div>
  );
});

/**
 * Finyk loader - mimics transaction list with summary card
 */
const FinykLoader = memo(function FinykLoader() {
  return (
    <>
      {/* Summary card */}
      <div className="rounded-3xl border border-line bg-finyk-soft/20 dark:bg-finyk-surface-dark/10 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <SkeletonText shimmer className="w-20" />
          <Skeleton shimmer className="w-10 h-10 rounded-xl" />
        </div>
        <Skeleton shimmer className="h-8 w-32" />
        <div className="flex gap-4">
          <SkeletonText shimmer className="w-24" />
          <SkeletonText shimmer className="w-24" />
        </div>
      </div>

      {/* Chart placeholder */}
      <Skeleton shimmer className="h-40 w-full rounded-2xl" />

      {/* Transaction list header */}
      <div className="flex items-center justify-between pt-2">
        <SkeletonText shimmer className="w-28" />
        <SkeletonText shimmer className="w-16" />
      </div>

      {/* Transaction items */}
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 rounded-2xl border border-line bg-panel"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <Skeleton shimmer className="w-11 h-11 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <SkeletonText shimmer className="w-32" />
              <SkeletonText shimmer className="w-20 h-2" />
            </div>
            <SkeletonText shimmer className="w-16" />
          </div>
        ))}
      </div>
    </>
  );
});

/**
 * Fizruk loader - mimics workout cards layout
 */
const FizrukLoader = memo(function FizrukLoader() {
  return (
    <>
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-line bg-fizruk-soft/20 dark:bg-fizruk-surface-dark/10 p-4 space-y-2"
          >
            <Skeleton shimmer className="w-8 h-8 rounded-xl" />
            <Skeleton shimmer className="h-6 w-12" />
            <SkeletonText shimmer className="w-full" />
          </div>
        ))}
      </div>

      {/* Section header */}
      <div className="flex items-center justify-between pt-4">
        <SkeletonText shimmer className="w-32" />
        <Skeleton shimmer className="w-8 h-8 rounded-xl" />
      </div>

      {/* Workout cards */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-line bg-panel p-4 space-y-3"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-center gap-3">
              <Skeleton shimmer className="w-12 h-12 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <SkeletonText shimmer className="w-40" />
                <SkeletonText shimmer className="w-24 h-2" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton shimmer className="h-7 w-16 rounded-full" />
              <Skeleton shimmer className="h-7 w-20 rounded-full" />
              <Skeleton shimmer className="h-7 w-14 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
});

/**
 * Routine loader - mimics habit grid layout
 */
const RoutineLoader = memo(function RoutineLoader() {
  return (
    <>
      {/* Progress ring / streak */}
      <div className="flex items-center justify-center py-6">
        <Skeleton shimmer className="w-28 h-28 rounded-full" />
      </div>

      {/* Date selector */}
      <div className="flex justify-center gap-2 pb-4">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} shimmer className="w-10 h-14 rounded-xl" />
        ))}
      </div>

      {/* Section header */}
      <div className="flex items-center justify-between">
        <SkeletonText shimmer className="w-24" />
        <SkeletonText shimmer className="w-12" />
      </div>

      {/* Habit grid */}
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-line bg-routine-surface/20 dark:bg-routine-surface-dark/10 p-4 space-y-3"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-center gap-2">
              <Skeleton shimmer className="w-8 h-8 rounded-xl shrink-0" />
              <SkeletonText shimmer className="flex-1" />
            </div>
            <Skeleton shimmer className="h-2 w-full rounded-full" />
            <SkeletonText shimmer className="w-16 h-2" />
          </div>
        ))}
      </div>
    </>
  );
});

/**
 * Nutrition loader - mimics macro tracking layout
 */
const NutritionLoader = memo(function NutritionLoader() {
  return (
    <>
      {/* Daily summary */}
      <div className="rounded-3xl border border-line bg-nutrition-soft/20 dark:bg-nutrition-surface-dark/10 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <SkeletonText shimmer className="w-32" />
          <Skeleton shimmer className="w-10 h-10 rounded-xl" />
        </div>
        <div className="flex items-center justify-center py-4">
          <Skeleton shimmer className="w-24 h-24 rounded-full" />
        </div>
        {/* Macro bars */}
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2 text-center">
              <Skeleton shimmer className="h-2 w-full rounded-full" />
              <SkeletonText shimmer className="w-8 mx-auto h-2" />
            </div>
          ))}
        </div>
      </div>

      {/* Meals section header */}
      <div className="flex items-center justify-between pt-2">
        <SkeletonText shimmer className="w-20" />
        <Skeleton shimmer className="w-8 h-8 rounded-xl" />
      </div>

      {/* Meal cards */}
      <div className="space-y-3">
        {["Сніданок", "Обід", "Вечеря"].map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-line bg-panel p-4 space-y-3"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton shimmer className="w-10 h-10 rounded-xl shrink-0" />
                <SkeletonText shimmer className="w-20" />
              </div>
              <SkeletonText shimmer className="w-16" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
});

/**
 * Generic loader - basic card list
 */
const GenericLoader = memo(function GenericLoader() {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <SkeletonText shimmer className="w-32" />
        <Skeleton shimmer className="w-10 h-10 rounded-xl" />
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-line bg-panel p-4"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-center gap-3">
              <Skeleton shimmer className="w-11 h-11 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <SkeletonText shimmer className="w-32" />
                <SkeletonText shimmer className="w-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
});

const LOADERS: Record<ModuleType, React.ComponentType> = {
  finyk: FinykLoader,
  fizruk: FizrukLoader,
  routine: RoutineLoader,
  nutrition: NutritionLoader,
  generic: GenericLoader,
};

export {
  FinykLoader,
  FizrukLoader,
  RoutineLoader,
  NutritionLoader,
  GenericLoader,
};
