import { cn } from "../../lib/ui/cn";
import { Skeleton, SkeletonText } from "./Skeleton";

/**
 * SkeletonCard — Placeholder shimmer for card-shaped content blocks.
 *
 * Matches the default Card radius/padding so the transition from
 * skeleton → real content feels seamless.
 */

export interface SkeletonCardProps {
  /** Number of text lines to render (default 3). */
  lines?: number;
  /** Show a header-bar skeleton at the top (default true). */
  header?: boolean;
  className?: string;
}

export function SkeletonCard({
  lines = 3,
  header = true,
  className,
}: SkeletonCardProps) {
  return (
    <div
      className={cn(
        "bg-panel border border-line rounded-3xl p-5 space-y-4",
        className,
      )}
      aria-hidden="true"
    >
      {header && <Skeleton className="h-5 w-2/5 rounded-xl" />}
      <div className="space-y-2.5">
        {Array.from({ length: lines }, (_, i) => (
          <SkeletonText
            key={i}
            className={cn("h-3", i === lines - 1 ? "w-3/5" : "w-full")}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * SkeletonList — Placeholder shimmer for list / feed sections.
 *
 * Renders `count` identical row skeletons with an avatar circle +
 * two text lines, matching the typical list-item layout.
 */

export interface SkeletonListProps {
  /** Number of rows (default 4). */
  count?: number;
  /** Show a leading circle (avatar / icon). */
  avatar?: boolean;
  className?: string;
}

export function SkeletonList({
  count = 4,
  avatar = true,
  className,
}: SkeletonListProps) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          {avatar && <Skeleton className="h-10 w-10 shrink-0 rounded-full" />}
          <div className="flex-1 space-y-2">
            <SkeletonText className="h-3 w-3/4" />
            <SkeletonText className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
