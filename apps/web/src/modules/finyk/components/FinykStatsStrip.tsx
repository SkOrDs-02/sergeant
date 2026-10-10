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

import type { ReactNode } from "react";
import { type IconName } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { Money } from "@shared/components/ui/Money";
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
  /** Сума або маска. `ReactNode`, бо суму малює `Money` кількома вузлами. */
  value: ReactNode;
  hint?: string | undefined;
  onClick?: (() => void) | undefined;
};

export function StatTile({ label, value, hint, onClick }: StatTileProps) {
  const base = cn(
    "block w-full text-left py-3 border-b border-line last:border-0",

    "transition-colors",
    onClick && "hover:border-muted/50 active:scale-[0.99]",
  );
  const inner = (
    <>
      <div className="flex items-center gap-2 text-style-caption text-muted">
        <span className="truncate">{label}</span>
      </div>
      <div className="text-style-body font-medium text-text mt-1 truncate">
        {value}
      </div>
      {hint && (
        <div className="text-style-caption text-subtle mt-0.5 truncate">
          {hint}
        </div>
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
      data-no-swipe
      className={cn("divide-y divide-line", className)}
      role="list"
    >
      {showSubsTile && (
        <StatTile
          iconName="refresh-cw"
          iconTone="muted"
          label="Підписки · міс"
          value={
            hideNumbers ? "••••" : <Money amount={Math.round(subsMonthly)} />
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
            hideNumbers ? (
              "••••"
            ) : (
              // Знак приходить рядком-дефісом, як і в потоках огляду;
              // напрямок нормалізуємо тут, символ малює `Money`.
              <Money
                amount={
                  nextCharge.sign === "-"
                    ? -Math.round(nextCharge.amount)
                    : Math.round(nextCharge.amount)
                }
                signed
              />
            )
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
            hideNumbers ? (
              "••••"
            ) : (
              <Money amount={-Math.round(urgentLiability.remaining)} />
            )
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
