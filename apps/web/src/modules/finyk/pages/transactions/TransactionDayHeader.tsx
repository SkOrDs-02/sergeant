/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { cn } from "@shared/lib/ui/cn";
import {
  formatStickyDayLabel,
  type computeDaySummary,
} from "./transactionsLib";
import { MaskedAmount } from "@shared/components/ui/MaskedAmount";
import { Money } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n/uk";

export interface TransactionDayHeaderProps {
  dayKey: string;
  collapsed: boolean;
  summary: ReturnType<typeof computeDaySummary>;
  showTotal: boolean;
  /**
   * Blur the day total behind the #9 privacy mask. The header itself is a
   * collapse-toggle button, so the total uses the static (non-interactive)
   * MaskedAmount variant to avoid nesting buttons.
   */
  masked?: boolean;
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
  masked = false,
  onToggle,
}: TransactionDayHeaderProps) {
  const label = formatStickyDayLabel(dayKey);
  return (
    <button
      type="button"
      onClick={() => onToggle(dayKey)}
      aria-expanded={!collapsed}
      aria-label={`${collapsed ? messages.actions.expand : messages.actions.collapse} ${label}`}
      className={cn(
        "w-full flex items-center justify-between gap-2 px-3 py-2.5",
        "pointer-coarse:min-h-[44px]",
        // §4 polish: caption (12px, meta/timestamp role) read as "cheap" for
        // what is effectively a section header — bumped to the label role
        // (13–14px) + semibold for real visual weight. `tracking-wide` is
        // dropped: wide letter-spacing on mixed-case day names (not
        // uppercase) just looked sparse rather than deliberate.
        "text-style-label font-semibold text-text transition-colors",
        // The day shell owns its surface: today is tinted, other days neutral.
        "bg-transparent hover:bg-line/40",
        "border-b border-line",
      )}
    >
      <span className="flex items-center gap-2 min-w-0">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="shrink-0 motion-safe:transition-transform motion-safe:duration-fast"
          style={{
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-style-caption font-semibold text-muted normal-case tabular-nums">
          · {summary.count}
        </span>
      </span>
      {showTotal && (
        <span className={cn("shrink-0 tabular-nums", "text-text")}>
          {/* `signed` дає `+` для додатних — знак несе сама сума, тож
              префікс у розмітці не дублюємо (анти-слоп П4). */}
          <MaskedAmount
            masked={masked}
            interactive={false}
            label={messages.finyk.daySummaryLabel}
          >
            <Money amount={summary.total / 100} signed kopecks tone="inherit" />
          </MaskedAmount>
        </span>
      )}
    </button>
  );
}
