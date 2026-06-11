import { cn } from "@shared/lib/ui/cn";

export interface SyncState {
  status: "error" | "partial" | "loading" | "ok";
}

export interface SyncTone {
  dot: string;
  text: string;
  pill: string;
}

/**
 * Returns styling for sync status indicator.
 */
export function getSyncTone(syncState?: SyncState | null): SyncTone {
  if (syncState?.status === "error") {
    return {
      dot: "bg-danger",
      text: "помилка",
      pill: "bg-danger-soft  text-danger  border-danger/20",
    };
  }
  if (syncState?.status === "partial") {
    return {
      dot: "bg-warning",
      text: "частково",
      pill: "bg-warning/10   text-warning border-warning/20",
    };
  }
  if (syncState?.status === "loading") {
    return {
      dot: "bg-muted",
      text: "оновлення",
      pill: "bg-panelHi     text-muted   border-line",
    };
  }
  return {
    dot: "bg-success",
    text: "ок",
    pill: "bg-success/10  text-success border-success/20",
  };
}

interface SwipeProgressProps {
  swipeDx: number;
  threshold: number;
}

/**
 * Swipe progress bar component for tab swipe gestures.
 */
export function SwipeProgressBar({
  swipeDx,
  threshold,
}: SwipeProgressProps): React.ReactElement | null {
  if (swipeDx === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 inset-x-0 h-0.5 z-20 overflow-hidden"
    >
      <div
        className={cn(
          "h-full",
          Math.abs(swipeDx) >= threshold ? "bg-finyk" : "bg-finyk/40",
        )}
        style={{
          width: `${Math.min(100, (Math.abs(swipeDx) / threshold) * 100)}%`,
          marginLeft: swipeDx < 0 ? "auto" : 0,
          transition: "background-color 120ms linear",
        }}
      />
    </div>
  );
}

export const SWIPE_THRESHOLD_PX = 60 as const;