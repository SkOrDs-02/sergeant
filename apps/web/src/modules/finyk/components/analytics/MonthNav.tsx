import { memo } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import { formatMonthYear } from "@shared/lib/time/formatDate";
import { messages } from "@shared/i18n";

const copy = messages.finyk.analyticsPage;

interface MonthNavProps {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}

// Навігація між місяцями. memo — пропси (year/month/onChange) змінюються рідко,
// а сторінка Analytics ре-рендериться при кожному завантаженні історії.
export const MonthNav = memo(function MonthNav({
  year,
  month,
  onChange,
}: MonthNavProps) {
  // Use Kyiv-local year/month so "current month" matches Europe/Kyiv day boundaries.
  const nowKyiv = getKyivDateParts();
  const isCurrentMonth = year === nowKyiv.year && month === nowKyiv.month;
  const label = formatMonthYear(new Date(year, month - 1, 1), {
    capitalize: true,
  });

  const go = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (m < 1) {
      m = 12;
      y--;
    }
    onChange(y, m);
  };

  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={() => go(-1)}
        className="min-w-[44px] min-h-[44px] rounded-lg border border-line flex items-center justify-center text-muted hover:text-text hover:bg-line/40 transition-colors"
        aria-label={copy.prevMonth}
      >
        <Icon name="chevron-left" size="sm" />
      </button>
      <span className="text-style-label text-text">{label}</span>
      <button
        type="button"
        onClick={() => go(1)}
        disabled={isCurrentMonth}
        className="min-w-[44px] min-h-[44px] rounded-lg border border-line flex items-center justify-center text-muted hover:text-text hover:bg-line/40 transition-colors disabled:opacity-30"
        aria-label={copy.nextMonth}
      >
        <Icon name="chevron-right" size="sm" />
      </button>
    </div>
  );
});
