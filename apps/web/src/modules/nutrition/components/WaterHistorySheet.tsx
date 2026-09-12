/**
 * Last validated: 2026-07-26
 * Status: Active
 *
 * Tapped from `WaterTrackerCard` — shows the last-7-days bar chart, 7/30-day
 * averages, current goal streak, and a 14-day list. Read-only: past days are
 * not editable (out of scope per water-history spec).
 */
import {
  getWaterLastNDays,
  getWaterAverageMl,
  getWaterLoggedDays,
  getWaterStreak,
  getPreviousWaterDayKey,
  todayISODate,
  type WaterLog,
} from "@sergeant/nutrition-domain";
import { Sheet } from "@shared/components/ui/Sheet";
import { Stat } from "@shared/components/ui/Stat";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import { fmt } from "./WaterTrackerCard";

const WEEKDAYS_UK = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/**
 * Заголовок секції зі старішими записами.
 *
 * AI-NOTE: літерал тут, а не в `messages.nutrition.waterHistory`, свідомо —
 * правка тримається в межах модуля Харчування, спільний i18n-файл не
 * чіпається. Переїде в `messages`, коли поруч зʼявиться друга причина його
 * редагувати.
 */
const EARLIER_TITLE = "Раніше";

function weekdayLabel(dayKey: string): string {
  const [y = 1970, m = 1, d = 1] = dayKey.split("-").map(Number);
  return WEEKDAYS_UK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
}

function dayListLabel(dayKey: string, todayKey: string, yesterdayKey: string) {
  if (dayKey === todayKey) return "Сьогодні";
  if (dayKey === yesterdayKey) return "Вчора";
  const [y = 1970, m = 1, d = 1] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export interface WaterHistorySheetProps {
  open: boolean;
  onClose: () => void;
  log: WaterLog;
  goalMl?: number;
}

const t = messages.nutrition.waterHistory;

export function WaterHistorySheet({
  open,
  onClose,
  log,
  goalMl = 0,
}: WaterHistorySheetProps) {
  const week = getWaterLastNDays(log, 7);
  const last14 = getWaterLastNDays(log, 14).slice().reverse();
  const avg7 = getWaterAverageMl(log, 7);
  const avg30 = getWaterAverageMl(log, 30);
  const streak = getWaterStreak(log, goalMl);
  // Дефект: і графік, і список — фіксовані вікна від «сьогодні», тож
  // 15 л, залиті три тижні тому, не показувались НІДЕ, а порожній стан
  // ще й запевняв, що історії немає. Тому «чи є дані» рахуємо по всьому
  // журналу, а дні поза 14-денним вікном виносимо окремою секцією.
  const loggedDays = getWaterLoggedDays(log);
  const recentKeys = new Set(last14.map((d) => d.dayKey));
  const earlierDays = loggedDays.filter((d) => !recentKeys.has(d.dayKey));
  const hasAnyData = loggedDays.length > 0;

  // ADR-0078: день пристрою, а не Kyiv — той самий ключ, під яким трекер
  // (useWaterTracker → nutrition-domain waterLog) реально пише "сьогодні".
  const todayKey = todayISODate();
  const yesterdayKey = getPreviousWaterDayKey(todayKey);

  const maxMl = Math.max(goalMl, ...week.map((d) => d.ml), 1);
  const goalPct = goalMl > 0 ? Math.min(100, (goalMl / maxMl) * 100) : null;

  return (
    <Sheet open={open} onClose={onClose} title={t.title}>
      {!hasAnyData ? (
        <EmptyState
          compact
          module="nutrition"
          title={t.emptyTitle}
          description={t.emptyDescription}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <div>
            <div className="text-style-caption text-subtle mb-2">
              {t.weekChartTitle}
            </div>
            <div className="relative h-24 flex items-end gap-2">
              {goalPct !== null && (
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-nutrition/50"
                  style={{ bottom: `${goalPct}%` }}
                  aria-hidden="true"
                />
              )}
              {week.map((d) => {
                const met = goalMl > 0 && d.ml >= goalMl;
                const pct = Math.max(2, (d.ml / maxMl) * 100);
                return (
                  <div
                    key={d.dayKey}
                    className="flex-1 flex flex-col items-center gap-1"
                  >
                    <div className="w-full h-24 flex items-end">
                      <div
                        className={cn(
                          "w-full rounded-t-md transition-[height]",
                          d.ml > 0
                            ? met
                              ? "bg-nutrition"
                              : "bg-nutrition/40"
                            : "bg-line/40",
                        )}
                        style={{ height: `${d.ml > 0 ? pct : 2}%` }}
                      />
                    </div>
                    <span className="text-style-caption text-subtle">
                      {weekdayLabel(d.dayKey)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Stat
              label={t.avg7Label}
              value={fmt(avg7)}
              variant="nutrition"
              size="sm"
            />
            <Stat
              label={t.avg30Label}
              value={fmt(avg30)}
              variant="nutrition"
              size="sm"
            />
            {goalMl > 0 && (
              <Stat
                label={t.streakLabel}
                value={`${streak} ${t.streakUnit}`}
                variant="nutrition"
                size="sm"
              />
            )}
          </div>

          <div>
            <div className="text-style-caption text-subtle mb-2">
              {t.dayListTitle}
            </div>
            <ul className="flex flex-col divide-y divide-line/60">
              {last14.map((d) => {
                const pct =
                  goalMl > 0 ? Math.round((d.ml / goalMl) * 100) : null;
                return (
                  <li
                    key={d.dayKey}
                    className="flex items-center justify-between py-2 text-style-body"
                  >
                    <span className="text-text">
                      {dayListLabel(d.dayKey, todayKey, yesterdayKey)}
                    </span>
                    <span className="tabular-nums text-subtle">
                      {fmt(d.ml)}
                      {pct !== null && ` · ${pct}${t.goalPctSuffix}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {earlierDays.length > 0 && (
            <div>
              <div className="text-style-caption text-subtle mb-2">
                {EARLIER_TITLE}
              </div>
              <ul className="flex flex-col divide-y divide-line/60">
                {earlierDays.map((d) => {
                  const pct =
                    goalMl > 0 ? Math.round((d.ml / goalMl) * 100) : null;
                  return (
                    <li
                      key={d.dayKey}
                      className="flex items-center justify-between py-2 text-style-body"
                    >
                      <span className="text-text">
                        {dayListLabel(d.dayKey, todayKey, yesterdayKey)}
                      </span>
                      <span className="tabular-nums text-subtle">
                        {fmt(d.ml)}
                        {pct !== null && ` · ${pct}${t.goalPctSuffix}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
