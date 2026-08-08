import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { safeWriteLS } from "@shared/lib/storage/storage";
import { TREND_STORAGE_PREFIX, readTrendOpen } from "./storage";

/**
 * Which direction of `delta` counts as an improvement for this metric.
 *
 * - `"up-is-good"` — e.g. energy, mood: a rising number is praise (success).
 * - `"down-is-good"` — a falling number is praise (success). Kept as the
 *   default so existing callers that don't pass this prop (weight-loss
 *   framing, historically the only metric this card rendered) keep their
 *   current colours unchanged.
 * - `"neutral"` — the module has no stance on direction (e.g. weight, where
 *   fizruk canon says there's no default goal) — render a flat, non-judging
 *   tone instead of success/warning either way.
 */
export type TrendDeltaDirection = "up-is-good" | "down-is-good" | "neutral";

export function CollapsibleTrendCard({
  storageKey,
  title,
  latestValue,
  latestUnit,
  delta,
  deltaDirection = "down-is-good",
  ariaLabel,
  children,
}: {
  storageKey: string;
  title: string;
  latestValue: number | null;
  latestUnit: string;
  delta: number | null;
  /** @default "down-is-good" — preserves pre-existing behaviour for callers that don't pass it. */
  deltaDirection?: TrendDeltaDirection;
  ariaLabel: string;
  children: ReactNode;
}) {
  const fullKey = TREND_STORAGE_PREFIX + storageKey;
  const [open, setOpen] = useState<boolean>(() => readTrendOpen(storageKey));
  const contentId = `trend-card-content-${storageKey}`;

  // Sync open-state across tabs via the `storage` event. When the same key is
  // written in another tab the browser fires `storage` in all other tabs, so
  // we update our local state to match without a round-trip through the server.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== fullKey) return;
      setOpen(e.newValue === "1");
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [fullKey]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      safeWriteLS(fullKey, next ? "1" : "0");
      return next;
    });
  }, [fullKey]);

  const deltaClass =
    delta == null || delta === 0
      ? "text-muted"
      : deltaDirection === "neutral"
        ? "text-subtle"
        : (deltaDirection === "up-is-good") === delta > 0
          ? "text-success-strong dark:text-success"
          : "text-warning-strong dark:text-warning";
  const deltaLabel =
    delta == null
      ? ""
      : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} ${latestUnit}`;

  return (
    <Card as="section" radius="lg" padding="none" aria-label={ariaLabel}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left",
          "rounded-2xl transition-colors",
          "hover:bg-panelHi/40",
        )}
      >
        <div className="flex-1 min-w-0">
          <SectionHeading as="h2" size="xs" className="mb-0!" variant="fizruk">
            {title}
          </SectionHeading>
        </div>
        {latestValue != null && (
          <div className="flex items-baseline gap-2 shrink-0">
            <span className="text-style-label tabular-nums text-text">
              {latestValue} {latestUnit}
            </span>
            {delta != null && delta !== 0 && (
              <span className={cn("text-style-caption", deltaClass)}>
                {deltaLabel}
              </span>
            )}
          </div>
        )}
        <span
          aria-hidden
          className={cn(
            "inline-flex justify-center w-4 text-muted transition-transform shrink-0",
            open ? "rotate-180" : "rotate-0",
          )}
        >
          <Icon name="chevron-down" size="md" />
        </span>
      </button>
      {open && (
        <div id={contentId} className="px-4 pb-4 pt-1">
          {children}
        </div>
      )}
    </Card>
  );
}
