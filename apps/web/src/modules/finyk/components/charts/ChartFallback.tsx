import { Skeleton } from "@shared/components/ui/Skeleton";
import { cn } from "@shared/lib/ui/cn";

// Shared skeleton block used as Suspense fallback while a lazy chart chunk
// is being fetched. Keeps the dashboard layout stable during the load.
export function ChartFallback({ className }: { className?: string }) {
  return (
    <Skeleton
      aria-hidden="true"
      className={cn("w-full h-20 rounded-xl", className)}
    />
  );
}
