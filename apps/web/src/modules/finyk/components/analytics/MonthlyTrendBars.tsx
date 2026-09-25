/**
 * Last validated: 2026-09-25
 * Status: Active
 */
import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Money } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n/uk";
import { formatNumberUk, NARROW_NBSP } from "@sergeant/shared";
import type { MonthlyTrendPoint } from "@sergeant/finyk-domain/domain/trends";

interface MonthlyTrendBarsProps {
  points: readonly MonthlyTrendPoint[];
  averageMinor?: number | null;
  perDayMinor?: number | null;
  showBalance?: boolean;
  className?: string;
}

const copy = messages.finyk.monthlyTrend;

const SHORT_MONTH = new Intl.DateTimeFormat("uk-UA", {
  month: "short",
  timeZone: "Europe/Kyiv",
});
const LONG_MONTH = new Intl.DateTimeFormat("uk-UA", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Kyiv",
});
// `month: "long"` разом із числом дня дає родовий відмінок («вересня»).
const GENITIVE_MONTH = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "long",
  timeZone: "Europe/Kyiv",
});

const midMonth = (key: string) => new Date(`${key}-15T12:00:00Z`);

/**
 * Стовпці витрат за місяцями (Р11). Поточний місяць неповний і так і
 * позначений, коротка історія показується як є з підписом, а не ховається.
 */
function MonthlyTrendBarsComponent({
  points,
  averageMinor = null,
  perDayMinor = null,
  showBalance = true,
  className,
}: MonthlyTrendBarsProps) {
  const first = points[0];
  if (!first) return null;
  const max = Math.max(...points.map((p) => p.spentMinor), 1);

  return (
    <div className={cn("space-y-3", className)}>
      <ul className="flex items-end gap-1 h-28" aria-label={copy.listLabel}>
        {points.map((p) => {
          const date = midMonth(p.month);
          const amount = showBalance
            ? `${formatNumberUk(Math.round(p.spentMinor / 100))}${NARROW_NBSP}₴`
            : copy.hiddenAmount;
          const label = [
            `${LONG_MONTH.format(date)}: ${amount}`,
            p.isCurrent ? copy.monthInProgress : null,
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <li
              key={p.month}
              className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1"
            >
              <span className="sr-only">{label}</span>
              <div
                className={cn(
                  "w-full max-w-8 rounded-t-md",
                  p.isCurrent
                    ? "bg-finyk/30 border border-dashed border-finyk"
                    : "bg-finyk",
                )}
                style={{
                  height: `${Math.max((p.spentMinor / max) * 100, p.spentMinor > 0 ? 4 : 1)}%`,
                }}
                aria-hidden
              />
              <span
                className="text-style-caption text-subtle truncate"
                aria-hidden
              >
                {SHORT_MONTH.format(date).replace(".", "")}
              </span>
            </li>
          );
        })}
      </ul>
      {points.length < 3 && (
        <p className="text-style-caption text-muted">
          {copy.shortHistory.replace(
            "{month}",
            GENITIVE_MONTH.format(midMonth(first.month)).replace(/^\d+\s*/, ""),
          )}
        </p>
      )}
      {showBalance && (averageMinor !== null || perDayMinor !== null) && (
        <div className="space-y-0.5 text-style-body text-muted">
          {averageMinor !== null && (
            <p>
              {copy.averagePrefix} <Money amount={averageMinor / 100} />{" "}
              {copy.averageSuffix}
            </p>
          )}
          {perDayMinor !== null && (
            <p>
              {copy.perDayPrefix} <Money amount={perDayMinor / 100} />{" "}
              {copy.perDaySuffix}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export const MonthlyTrendBars = memo(MonthlyTrendBarsComponent);
