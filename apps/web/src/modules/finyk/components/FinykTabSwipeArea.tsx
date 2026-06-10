import type { CSSProperties, ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";

export interface FinykTabSwipeAreaArgs {
  pageKey: string;
  dragDx: number;
  threshold: number;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  children: ReactNode;
}

const PROGRESS_TRANSITION = "background-color 120ms linear";
const SETTLE_TRANSITION = "transform 200ms cubic-bezier(0.32, 0.72, 0, 1)";
const RUBBER_BAND_FACTOR = 0.45;

function progressBarStyle(dragDx: number, threshold: number): CSSProperties {
  const absDx = Math.abs(dragDx);
  const widthPct = Math.min(100, (absDx / threshold) * 100);
  return {
    width: `${widthPct}%`,
    marginLeft: dragDx < 0 ? "auto" : 0,
    transition: PROGRESS_TRANSITION,
  };
}

function pageStyle(dragDx: number): CSSProperties {
  if (dragDx !== 0) {
    return {
      transform: `translate3d(${dragDx * RUBBER_BAND_FACTOR}px, 0, 0)`,
      transition: "none",
      willChange: "transform",
    };
  }
  return {
    transform: "translate3d(0, 0, 0)",
    transition: SETTLE_TRANSITION,
  };
}

export function FinykTabSwipeArea({
  pageKey,
  dragDx,
  threshold,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  children,
}: FinykTabSwipeAreaArgs) {
  return (
    <div
      className="flex-1 overflow-hidden flex flex-col min-h-0 touch-pan-y relative"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {dragDx !== 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 inset-x-0 h-0.5 z-20 overflow-hidden"
        >
          <div
            className={cn(
              "h-full",
              Math.abs(dragDx) >= threshold ? "bg-finyk" : "bg-finyk/40",
            )}
            style={progressBarStyle(dragDx, threshold)}
          />
        </div>
      )}
      <div
        key={`page-${pageKey}`}
        className="flex-1 overflow-hidden flex flex-col min-h-0 motion-safe:animate-fade-in"
        style={pageStyle(dragDx)}
      >
        {children}
      </div>
    </div>
  );
}
