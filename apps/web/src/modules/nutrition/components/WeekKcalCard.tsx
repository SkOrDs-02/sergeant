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
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
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
  /**
   * Ціль на КОЖЕН день тижня, вирівняна з `rows`. Не одне число: ціль може
   * змінитись серед тижня, і минулі дні судяться тією, що діяла тоді
   * (ADR-0091). `null` — цілі на той день не було.
   */
  goalsByDay: readonly (number | null)[];
  todayIso: string;
  /**
   * Відкриває журнал. Аргумент — день, на якому його відкрити; без
   * аргументу журнал лишається на своєму поточному дні (сьогодні).
   *
   * AI-CONTEXT: картка має власний обраний день (тап по стовпчику), і до
   * фіксу PR-N5 (аудит 2026-09-13) посилання «Журнал» його ігнорувало:
   * людина тапала середу, читала її калорії в підрядку, тиснула «Журнал» —
   * і потрапляла в сьогодні. Обраний день тут не косметика підрядка, а
   * намір; посилання його передає.
   */
  onGoToLog?: ((dateIso?: string) => void) | undefined;
}

export function WeekKcalCard({
  rows,
  goalsByDay,
  todayIso,
  onGoToLog,
}: WeekKcalCardProps) {
  const model = useMemo(
    () => computeWeekKcalChart(rows, goalsByDay),
    [rows, goalsByDay],
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
    <Card as="section" padding="md">
      <SectionHeading
        size="lg"
        action={
          <button
            type="button"
            onClick={() => onGoToLog?.(selectedDate ?? undefined)}
            className="touch-target rounded-lg text-style-label font-semibold text-text focus-ring"
          >
            {t.logLink}
          </button>
        }
      >
        {t.heading}
      </SectionHeading>

      <div className="mt-1 mb-3 flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "text-style-label truncate tabular-nums",
            selected ? "text-text" : "text-muted",
          )}
        >
          {summaryText}
        </span>
        {scaleText !== null && (
          <span className="text-style-caption text-subtle tabular-nums shrink-0">
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
              className="flex-1 flex flex-col items-center gap-0.5 appearance-none bg-transparent border-0 p-0 cursor-pointer rounded-md focus-ring"
            >
              <div
                className="relative w-full flex justify-center items-end"
                style={{ height: `${PLOT_HEIGHT}px` }}
              >
                {bar.goalRatio !== null && (
                  // Лінія цілі малюється в КОЖНІЙ колонці окремо — і тепер це
                  // не лише зручність розмітки: висота береться з ЦЬОГО дня,
                  // тож у тижні зі зміненою ціллю лінія йде сходинкою.
                  // Пунктир і так має розриви, тож 4px проміжки не видно.
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 border-t border-dashed border-subtle"
                    style={{ bottom: `${bar.goalRatio * PLOT_HEIGHT}px` }}
                  />
                )}
                {bar.isEmpty ? (
                  // Канон §5.2: пропущений день — це неповні дані, а не
                  // нульове споживання. Плаский трек читається як «нічого
                  // не внесено», огризок у 3px читався як «мало зʼїв».
                  <div
                    data-testid={`week-kcal-empty-${bar.date}`}
                    className="w-full max-w-[18px] h-0.5 rounded-[3px] bg-line"
                  />
                ) : (
                  <div
                    data-testid={`week-kcal-bar-${bar.date}`}
                    className={cn(
                      "relative w-full max-w-[18px] rounded-t-[3px] transition-[height,background-color] duration-slow",
                      // Небезпека лише понад допуск (канон Їжі: червоний
                      // при >110 % ккал), інакше hue модуля в даних.
                      bar.isOver ? "bg-danger" : "bg-chart-nutrition",
                      isToday || isSelected ? "opacity-100" : "opacity-40",
                    )}
                    style={{ height: `${height}px` }}
                  />
                )}
              </div>
              <span
                className={cn(
                  "text-style-caption leading-none",
                  isToday || isSelected ? "text-text font-bold" : "text-subtle",
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
