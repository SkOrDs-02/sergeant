import { memo, useId, useState } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";
import { ChoiceGroup } from "@shared/components/ui/Choice";
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

const ARROW =
  "focus-ring flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-text hover:bg-panel motion-safe:transition-colors disabled:opacity-30";

export interface PeriodNavProps {
  label: string;
  prevAria: string;
  nextAria: string;
  pickAria: string;
  onPrev: () => void;
  onNext: () => void;
  onPick: () => void;
  nextDisabled?: boolean | undefined;
}

/**
 * Один перемикач періоду для Операцій і Аналізу (redesign v3.2, позиція 08):
 * голі стрілки, назва 15 / 600 без шеврона, тап по назві відкриває вибір.
 */
export const PeriodNav = memo(function PeriodNav({
  label,
  prevAria,
  nextAria,
  pickAria,
  onPrev,
  onNext,
  onPick,
  nextDisabled,
}: PeriodNavProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onPrev}
        className={ARROW}
        aria-label={prevAria}
      >
        <Icon name="chevron-left" size="sm" />
      </button>
      <button
        type="button"
        onClick={onPick}
        className="focus-ring min-h-[44px] min-w-0 truncate rounded-lg px-1 text-style-body font-semibold text-text"
        aria-haspopup="dialog"
        aria-label={`${pickAria}: ${label}`}
      >
        {label}
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className={ARROW}
        aria-label={nextAria}
      >
        <Icon name="chevron-right" size="sm" />
      </button>
    </div>
  );
});

interface MonthPickSheetProps {
  /** Підписи місяців від поточного назад: `[0]` поточний. */
  months: readonly string[];
  /** Скільки місяців тому обраний. */
  selectedBack: number;
  onPick: (monthsBack: number) => void;
  onClose: () => void;
}

/** Вибір місяця для Операцій: рядки від поточного назад. */
export function MonthPickSheet({
  months,
  selectedBack,
  onPick,
  onClose,
}: MonthPickSheetProps) {
  return (
    <Sheet open onClose={onClose} title={copy.kinds.month}>
      <div className="p-4">
        <ChoiceGroup
          variant="rows"
          ariaLabel={copy.kinds.month}
          items={months.map((label, i) => ({ value: String(i), label }))}
          value={String(selectedBack)}
          onChange={(v) => onPick(Number(v))}
        />
      </div>
    </Sheet>
  );
}

interface AnalyticsPeriodNavProps {
  period: AnalyticsPeriod;
  todayKey: string;
  onChange: (period: AnalyticsPeriod) => void;
}

/**
 * Перемикач періоду Аналітики (Р5.7): стрілки гортають обраний період, тап
 * по підпису відкриває аркуш «Тиждень · Місяць · Рік · Діапазон».
 */
export function AnalyticsPeriodNav({
  period,
  todayKey,
  onChange,
}: AnalyticsPeriodNavProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PeriodNav
        label={formatAnalyticsPeriod(period, todayKey)}
        prevAria={copy.prev[period.kind]}
        nextAria={copy.next[period.kind]}
        pickAria={copy.choosePeriod}
        onPrev={() => onChange(shiftPeriod(period, -1))}
        onNext={() => onChange(shiftPeriod(period, 1))}
        onPick={() => setOpen(true)}
        nextDisabled={isLatestPeriod(period, todayKey)}
      />
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
    </>
  );
}

function PeriodSheet({
  period,
  todayKey,
  onClose,
  onChange,
}: AnalyticsPeriodNavProps & { onClose: () => void }) {
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
