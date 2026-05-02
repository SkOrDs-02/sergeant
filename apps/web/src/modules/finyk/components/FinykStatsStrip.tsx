/**
 * Horizontally-scrollable strip of stats tiles shared by the Активи and
 * Планування pages in Finyk. Each tile is rendered only when its data
 * slot is non-null, so empty accounts collapse the strip to nothing —
 * no placeholder boxes, no empty container.
 *
 * The component is purely presentational: consumers compute the figures
 * via `computeFinykSchedule` (see `../lib/upcomingSchedule.ts`) and pass
 * them in as props.
 */

import { Icon, type IconName } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/cn";
import {
  formatRelativeDue,
  type UpcomingCharge,
  type UrgentLiability,
} from "../lib/upcomingSchedule";

type IconTone = "success" | "danger" | "muted";

type StatTileProps = {
  iconName: IconName;
  iconTone: IconTone;
  label: string;
  value: string;
  hint?: string;
  onClick?: () => void;
};

function toneClass(tone: IconTone) {
  return tone === "success"
    ? "text-success"
    : tone === "danger"
      ? "text-danger"
      : "text-muted";
}

export function StatTile({
  iconName,
  iconTone,
  label,
  value,
  hint,
  onClick,
}: StatTileProps) {
  const base = cn(
    "flex-1 min-w-[9.5rem] shrink-0 text-left px-3 py-2.5",
    "bg-panelHi border border-line rounded-2xl",
    "transition-colors",
    onClick && "hover:border-muted/50 active:scale-[0.99]",
  );
  const inner = (
    <>
      <div className="flex items-center gap-2 text-meta text-muted">
        <span className={cn("inline-flex", toneClass(iconTone))} aria-hidden>
          <Icon name={iconName} size={14} />
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div className="text-sm font-bold text-text mt-1 truncate">{value}</div>
      {hint && (
        <div className="text-meta text-subtle mt-0.5 truncate">{hint}</div>
      )}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base}>
        {inner}
      </button>
    );
  }
  return <div className={base}>{inner}</div>;
}

export type FinykStatsStripProps = {
  /** Sum of UAH subscription amounts; tile hidden when `subsCount === 0`. */
  subsMonthly: number;
  subsCount: number;
  /** Earliest upcoming charge across subs + dated debts + receivables. */
  nextCharge: UpcomingCharge | null;
  /** Largest manual debt with a dueDate; shown when present. */
  urgentLiability?: UrgentLiability | null;
  todayStart: Date;
  /** Masks values to `••••` when the user has hidden balances globally. */
  showBalance: boolean;
  /** Tap handlers — when omitted the tile renders as a non-interactive div. */
  onOpenSubs?: () => void;
  onOpenLiabilities?: () => void;
  className?: string;
};

export function FinykStatsStrip({
  subsMonthly,
  subsCount,
  nextCharge,
  urgentLiability = null,
  todayStart,
  showBalance,
  onOpenSubs,
  onOpenLiabilities,
  className,
}: FinykStatsStripProps) {
  const showSubsTile = subsCount > 0;
  const showNextTile = Boolean(nextCharge);
  const showUrgentTile = Boolean(urgentLiability);
  if (!showSubsTile && !showNextTile && !showUrgentTile) return null;
  const hideNumbers = !showBalance;
  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hidden",
        className,
      )}
      role="list"
    >
      {showSubsTile && (
        <StatTile
          iconName="refresh-cw"
          iconTone="muted"
          label="Підписки · міс"
          value={
            hideNumbers
              ? "••••"
              : `${subsMonthly.toLocaleString("uk-UA", {
                  maximumFractionDigits: 0,
                })} ₴`
          }
          hint={`${subsCount} активн${subsCount === 1 ? "а" : "их"}`}
          onClick={onOpenSubs}
        />
      )}
      {showNextTile && nextCharge && (
        <StatTile
          iconName="calendar"
          iconTone={nextCharge.sign === "-" ? "danger" : "success"}
          label="Наступний платіж"
          value={
            hideNumbers
              ? "••••"
              : `${nextCharge.sign}${nextCharge.amount.toLocaleString("uk-UA", {
                  maximumFractionDigits: 0,
                })} ₴`
          }
          hint={`${nextCharge.label} · ${formatRelativeDue(
            nextCharge.dueDate,
            todayStart,
          )}`}
        />
      )}
      {showUrgentTile && urgentLiability && (
        <StatTile
          iconName="alert"
          iconTone="danger"
          label="Пасив з дедлайном"
          value={
            hideNumbers
              ? "••••"
              : `−${urgentLiability.remaining.toLocaleString("uk-UA", {
                  maximumFractionDigits: 0,
                })} ₴`
          }
          hint={`${urgentLiability.name} · ${formatRelativeDue(
            urgentLiability.dueDate,
            todayStart,
          )}`}
          onClick={onOpenLiabilities}
        />
      )}
    </div>
  );
}
