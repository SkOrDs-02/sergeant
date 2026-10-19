import { memo, useId, useState } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";
import { DateField } from "@shared/components/ui/DateField";
import { Segmented } from "@shared/components/ui/Segmented";
import { Sheet } from "@shared/components/ui/Sheet";
import { messages } from "@shared/i18n";
import {
  isLatestPeriod,
  periodOf,
  rangePeriod,
  shiftPeriod,
  type AnalyticsPeriod,
  type AnalyticsPeriodKind,
} from "@sergeant/finyk-domain/domain/analyticsPeriod";
import { formatAnalyticsPeriod } from "../../lib/analyticsPeriodLabel";

const copy = messages.finyk.analyticsPage;

interface PeriodNavProps {
  period: AnalyticsPeriod;
  todayKey: string;
  onChange: (period: AnalyticsPeriod) => void;
}

const NAV_BUTTON =
  "min-w-[44px] min-h-[44px] rounded-lg border border-line flex items-center justify-center text-muted hover:text-text hover:bg-line/40 transition-colors";

/**
 * Перемикач періоду Аналітики (Р5.7): стрілки гортають обраний період, тап
 * по підпису відкриває аркуш «Тиждень · Місяць · Рік · Діапазон».
 */
export const PeriodNav = memo(function PeriodNav({
  period,
  todayKey,
  onChange,
}: PeriodNavProps) {
  const [open, setOpen] = useState(false);
  const atLatest = isLatestPeriod(period, todayKey);

  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => onChange(shiftPeriod(period, -1))}
        className={NAV_BUTTON}
        aria-label={copy.prev[period.kind]}
      >
        <Icon name="chevron-left" size="sm" />
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[44px] min-w-0 px-3 rounded-lg flex items-center gap-1 text-style-label text-text hover:bg-line/40 transition-colors"
        aria-haspopup="dialog"
        aria-label={`${formatAnalyticsPeriod(period, todayKey)}. ${copy.choosePeriod}`}
      >
        <span className="truncate">
          {formatAnalyticsPeriod(period, todayKey)}
        </span>
        <Icon name="chevron-down" size="sm" className="text-muted" />
      </button>
      <button
        type="button"
        onClick={() => onChange(shiftPeriod(period, 1))}
        disabled={atLatest}
        className={`${NAV_BUTTON} disabled:opacity-30`}
        aria-label={copy.next[period.kind]}
      >
        <Icon name="chevron-right" size="sm" />
      </button>
      {open && (
        <PeriodSheet
          period={period}
          todayKey={todayKey}
          onClose={() => setOpen(false)}
          onChange={(p) => {
            setOpen(false);
            onChange(p);
          }}
        />
      )}
    </div>
  );
});

function PeriodSheet({
  period,
  todayKey,
  onClose,
  onChange,
}: PeriodNavProps & { onClose: () => void }) {
  const fromId = useId();
  const toId = useId();
  const [kind, setKind] = useState<AnalyticsPeriodKind>(period.kind);
  // Новий період бере за опору той, що вже відкритий, а не сьогодні: з
  // травня людина переходить на тиждень наприкінці травня.
  const anchor = period.toKey < todayKey ? period.toKey : todayKey;
  const [fromKey, setFromKey] = useState(period.fromKey);
  const [toKey, setToKey] = useState(anchor);
  const rangeReady = Boolean(fromKey && toKey);

  return (
    <Sheet open onClose={onClose} title={copy.sheetTitle}>
      <div className="p-4 space-y-4">
        <Segmented
          items={(["week", "month", "year", "range"] as const).map((v) => ({
            value: v,
            label: copy.kinds[v],
          }))}
          value={kind}
          onChange={(v) => {
            setKind(v);
            if (v !== "range") onChange(periodOf(v, anchor));
          }}
          layout="bar"
          size="md"
          semantics="filter"
          ariaLabel={copy.sheetTitle}
        />
        {kind === "range" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <DateField
                id={fromId}
                label={copy.rangeFrom}
                value={fromKey}
                max={todayKey}
                onChange={(e) => setFromKey(e.target.value)}
              />
              <DateField
                id={toId}
                label={copy.rangeTo}
                value={toKey}
                max={todayKey}
                onChange={(e) => setToKey(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="solid"
              tone="ink"
              className="w-full"
              disabled={!rangeReady}
              onClick={() => onChange(rangePeriod(fromKey, toKey))}
            >
              {copy.rangeApply}
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
