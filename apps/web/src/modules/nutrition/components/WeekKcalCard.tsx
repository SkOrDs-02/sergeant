/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Тижневий ккал-графік дашборда Харчування.
 *
 * AI-CONTEXT: винесено з `NutritionDashboard.tsx` (там був інлайновий
 * `MiniBar`) за фідбеком тестера 2026-08-17 — «не зрозуміла шкала, стовпчик
 * це скільки калорій?». Симптом він описав як «немає підписів», але причина
 * була в шкалі: стеля бралась як максимум самого тижня, тож найвищий
 * стовпчик виходив на 100% завжди — і при 800 ккал, і при 3000. Підписи над
 * кожним стовпчиком цього не лікують (сім чотиризначних чисел над 48px
 * плотом = каша, і вони дають значення без масштабу), тому опора тут одна й
 * названа явно: лінія цілі, а без цілі — підписана стеля «макс N».
 *
 * Цифра дня показується для ОДНОГО вибраного дня в підрядку, а не для всіх
 * семи. Патерн дзеркалить `core/hub/NutritionCard.tsx` (`BarChart`) — там
 * той самий tap-to-select із `data-compact`: сім колонок фізично не можуть
 * бути по 44px на 360px-екрані, і саме для таких щільних cells існує
 * опт-аут із `apps/web/src/styles/mobile.css`.
 */
import { useMemo, useState } from "react";
import { Icon } from "@shared/components/ui/Icon";

import { Card } from "@shared/components/ui/Card";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import { getKyivMondayIndex, parseKyivDate } from "@shared/lib/time/kyivTime";
import {
  computeWeekKcalChart,
  type MacrosRow,
} from "@sergeant/nutrition-domain";
import { formatNumberUk } from "@sergeant/shared";

const t = messages.nutrition.weekKcal;

const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"] as const;
const PLOT_HEIGHT = 48;
/** Мінімальна видима висота ненульового дня — 50 ккал теж мусять бути видні. */
const MIN_BAR_HEIGHT = 3;

function fmtKcal(n: number): string {
  return formatNumberUk(Math.round(n));
}

function dayLabel(dateIso: string): string {
  const index = getKyivMondayIndex(parseKyivDate(dateIso) ?? undefined);
  return DAY_LABELS[index] ?? "";
}

export interface WeekKcalCardProps {
  rows: MacrosRow[];
  targetKcal: number;
  todayIso: string;
  onGoToLog?: (() => void) | undefined;
}

export function WeekKcalCard({
  rows,
  targetKcal,
  todayIso,
  onGoToLog,
}: WeekKcalCardProps) {
  const model = useMemo(
    () => computeWeekKcalChart(rows, targetKcal),
    [rows, targetKcal],
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const selected = model.bars.find((b) => b.date === selectedDate) ?? null;

  // Підрядок несе рівно одне повідомлення за раз: обраний день, якщо він є,
  // інакше агрегат тижня. Це і є відповідь на «стовпчик це скільки калорій».
  let summaryText: string;
  if (selected) {
    summaryText = selected.isEmpty
      ? `${dayLabel(selected.date)} · ${t.emptyDay}`
      : `${dayLabel(selected.date)} · ${fmtKcal(selected.kcal)} ${t.kcalUnit}`;
  } else if (model.daysLogged > 0) {
    summaryText = `${fmtKcal(model.totalKcal)} ${t.kcalUnit} · ${
      t.avgPrefix
    } ${fmtKcal(model.avgKcal)}${t.avgSuffix}`;
  } else {
    summaryText = t.emptyWeek;
  }

  // Опора шкали. З ціллю її несе пунктирна лінія, тож підпис називає ціль;
  // без цілі — стелю. Без жодного з двох висота стовпчика не означає нічого.
  let scaleText: string | null = null;
  if (model.goalKcal > 0) {
    scaleText = `${t.goalPrefix} ${fmtKcal(model.goalKcal)}`;
  } else if (model.totalKcal > 0) {
    scaleText = `${t.ceilingPrefix} ${fmtKcal(model.ceiling)}`;
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-style-label text-text">{t.heading}</div>
        <button
          type="button"
          onClick={onGoToLog}
          className="inline-flex items-center gap-0.5 text-style-caption text-nutrition-strong dark:text-nutrition hover:underline"
        >
          {t.logLink}
          <Icon name="chevron-right" size={14} aria-hidden />
        </button>
      </div>

      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span
          className={cn(
            "text-style-caption truncate",
            selected ? "text-text" : "text-subtle",
          )}
        >
          {summaryText}
        </span>
        {scaleText !== null && (
          <span className="text-style-caption text-muted shrink-0">
            {scaleText}
          </span>
        )}
      </div>

      <div
        className="flex items-end gap-1"
        role="group"
        aria-label={t.chartAriaLabel}
      >
        {model.bars.map((bar) => {
          const isToday = bar.date === todayIso;
          const isSelected = bar.date === selectedDate;
          const label = dayLabel(bar.date);
          const height = bar.isEmpty
            ? 0
            : Math.max(MIN_BAR_HEIGHT, bar.ratio * PLOT_HEIGHT);
          return (
            <button
              key={bar.date}
              type="button"
              data-compact
              aria-pressed={isSelected}
              aria-label={
                bar.isEmpty
                  ? `${label}, ${t.emptyDay}`
                  : `${label}, ${fmtKcal(bar.kcal)} ${t.kcalUnit}`
              }
              onClick={() => setSelectedDate(isSelected ? null : bar.date)}
              className="flex-1 flex flex-col items-center gap-0.5 appearance-none bg-transparent border-0 p-0 cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutrition/60"
            >
              <div
                className="relative w-full flex justify-center items-end"
                style={{ height: `${PLOT_HEIGHT}px` }}
              >
                {model.goalRatio !== null && (
                  // Лінія цілі малюється в КОЖНІЙ колонці окремо, а не одним
                  // елементом поверх плоту: так вона не залежить від висоти
                  // рядка підписів і не потребує абсолютного позиціювання
                  // відносно всієї картки. Пунктир і так має розриви, тож
                  // 4px проміжки між колонками не видно.
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 border-t border-dashed border-text/25"
                    style={{ bottom: `${model.goalRatio * PLOT_HEIGHT}px` }}
                  />
                )}
                {bar.isEmpty ? (
                  // Канон §5.2: пропущений день — це неповні дані, а не
                  // нульове споживання. Плаский трек читається як «нічого
                  // не внесено», огризок у 3px читався як «мало зʼїв».
                  <div
                    data-testid={`week-kcal-empty-${bar.date}`}
                    className="w-full max-w-[18px] h-0.5 rounded-full bg-text/15"
                  />
                ) : (
                  <div
                    data-testid={`week-kcal-bar-${bar.date}`}
                    className={cn(
                      "relative w-full max-w-[18px] rounded-t-md transition-[height,background-color] duration-slow",
                      bar.isOver ? "bg-warning" : "bg-nutrition",
                      isToday || isSelected ? "opacity-100" : "opacity-40",
                    )}
                    style={{ height: `${height}px` }}
                  />
                )}
              </div>
              <span
                className={cn(
                  "text-style-caption leading-none",
                  isToday || isSelected ? "text-text font-bold" : "text-muted",
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
