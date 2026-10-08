/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import {
  SkeletonMealCard,
  SkeletonText,
  Skeleton,
} from "@shared/components/ui/Skeleton";

/** Скелетон плану дня; винесено з `NutritionApp` під стелю Hard Rule #18. */
export function DayPlanLoadingSkeleton() {
  return (
    <div className="space-y-3 motion-safe:animate-in motion-safe:fade-in">
      <div className="flex items-center justify-between px-1 pb-1">
        <SkeletonText shimmer className="w-32" />
        <Skeleton shimmer className="w-20 h-6 rounded-full" />
      </div>
      {[0, 1, 2].map((i) => (
        <SkeletonMealCard
          key={i}
          shimmer
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}
