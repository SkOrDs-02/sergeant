import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Card } from "@shared/components/ui/Card";
import { cn } from "@shared/lib/cn";
import { safeWriteLS } from "@shared/lib/storage";
import { TREND_STORAGE_PREFIX, readTrendOpen } from "./storage";

export function CollapsibleTrendCard({
  storageKey,
  title,
  latestValue,
  latestUnit,
  delta,
  ariaLabel,
  children,
}: {
  storageKey: string;
  title: string;
  latestValue: number | null;
  latestUnit: string;
  delta: number | null;
  ariaLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<boolean>(() => readTrendOpen(storageKey));
  const contentId = `trend-card-content-${storageKey}`;

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      safeWriteLS(TREND_STORAGE_PREFIX + storageKey, next ? "1" : "0");
      return next;
    });
  }, [storageKey]);

  const deltaClass =
    delta == null || delta === 0
      ? "text-muted"
      : delta > 0
        ? "text-warning"
        : "text-success";
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
          <SectionHeading as="h2" size="sm" className="!mb-0">
            {title}
          </SectionHeading>
        </div>
        {latestValue != null && (
          <div className="flex items-baseline gap-2 shrink-0">
            <span className="text-style-label tabular-nums text-text">
              {latestValue} {latestUnit}
            </span>
            {delta != null && delta !== 0 && (
              <span className={cn("text-xs font-semibold", deltaClass)}>
                {deltaLabel}
              </span>
            )}
          </div>
        )}
        <span
          aria-hidden
          className={cn(
            "inline-block w-4 text-muted transition-transform shrink-0",
            open ? "rotate-180" : "rotate-0",
          )}
        >
          ▾
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
