import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { Measure } from "@shared/components/ui/Measure";
import { cn } from "@shared/lib/ui/cn";
import { safeWriteLS } from "@shared/lib/storage/storage";
import { TREND_STORAGE_PREFIX, readTrendOpen } from "./storage";

/**
 * `Measure` (`splitMoneyParts`) needs an explicit fraction-digit count —
 * unlike the old raw `{latestValue}` interpolation it won't just print
 * however many decimals the number happens to carry. Weight/sleep inputs
 * step by 0.1/0.5 so a genuine fraction is meaningful; energy/mood are
 * always whole 1-5 scores. Rounding every card to a fixed 1 decimal would
 * turn "4 /5" into "4,0 /5" — a cosmetic regression the locale fix (defect
 * #7) doesn't ask for. Derive digits from the value itself instead.
 */
function latestValueFractionDigits(n: number): 0 | 1 {
  return Number.isInteger(n) ? 0 : 1;
}

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

  return (
    <Card as="section" radius="lg" padding="none" aria-label={ariaLabel}>
      {/* AI-CONTEXT: `<h2>` wraps the WHOLE toggle button (WAI-ARIA
          disclosure/accordion pattern) instead of living inside it —
          a heading nested inside a `role="button"` (native `<button>`)
          loses its heading semantics for most AT (defect #2). `contents`
          removes the h2's own box so it doesn't affect the flex layout;
          only the button inside participates in it. */}
      <h2 className="contents">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={contentId}
          className={cn(
            "focus-ring w-full flex items-center gap-3 px-4 py-3 text-left",
            "rounded-2xl transition-colors",
            "hover:bg-panelHi/40",
          )}
        >
          <div className="flex-1 min-w-0">
            <SectionHeading
              as="span"
              size="xs"
              className="mb-0!"
              variant="fizruk"
            >
              {title}
            </SectionHeading>
          </div>
          {latestValue != null && (
            <div className="flex items-baseline gap-2 shrink-0">
              <span
                data-testid="trend-latest-value"
                className="text-style-label tabular-nums text-text"
              >
                <Measure
                  value={latestValue}
                  unit={latestUnit}
                  fractionDigits={latestValueFractionDigits(latestValue)}
                />
              </span>
              {delta != null && delta !== 0 && (
                <span
                  data-testid="trend-delta"
                  className={cn("text-style-caption", deltaClass)}
                >
                  <Measure
                    value={delta}
                    unit={latestUnit}
                    fractionDigits={1}
                    signed
                    tone="inherit"
                  />
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
      </h2>
      {open && (
        <div id={contentId} className="px-4 pb-4 pt-1">
          {children}
        </div>
      )}
    </Card>
  );
}
