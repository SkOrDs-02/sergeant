import { cn } from "@shared/lib/cn";
import { fmtAmt } from "../../utils";
import { CURRENCY } from "../../constants";
import {
  formatStickyDayLabel,
  type computeDaySummary,
} from "./transactionsLib";

export interface TransactionDayHeaderProps {
  dayKey: string;
  collapsed: boolean;
  summary: ReturnType<typeof computeDaySummary>;
  showTotal: boolean;
  onToggle: (key: string) => void;
}

/**
 * Sticky group header rendered by `GroupedVirtuoso` for every day in
 * the transaction list.
 *
 * Tap toggles the day's collapse state. The label uses the locale-aware
 * "Сьогодні / Вчора / 12 квіт" formatter so today/yesterday read more
 * naturally than a raw date.
 */
export function TransactionDayHeader({
  dayKey,
  collapsed,
  summary,
  showTotal,
  onToggle,
}: TransactionDayHeaderProps) {
  const label = formatStickyDayLabel(dayKey);
  return (
    <button
      type="button"
      onClick={() => onToggle(dayKey)}
      aria-expanded={!collapsed}
      aria-label={`${collapsed ? "Розгорнути" : "Згорнути"} ${label}`}
      className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-bg/95 backdrop-blur-sm border-b border-line text-xs font-semibold text-text tracking-wide hover:bg-panelHi transition-colors"
    >
      <span className="flex items-center gap-2 min-w-0">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="shrink-0 motion-safe:transition-transform motion-safe:duration-150"
          style={{
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-micro font-semibold text-muted normal-case tabular-nums">
          · {summary.count}
        </span>
      </span>
      {showTotal && (
        <span
          className={cn(
            "shrink-0 tabular-nums",
            summary.total > 0 ? "text-success" : "text-text",
          )}
        >
          {/* fmtAmt сам додає `+`/`-` — не дублюємо префікс. */}
          {fmtAmt(summary.total, CURRENCY.UAH)}
        </span>
      )}
    </button>
  );
}
