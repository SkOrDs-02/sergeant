import { memo } from "react";
import { formatMoney } from "@sergeant/shared";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";

export interface MonthStripDay {
  /** Київський день-ключ, `YYYY-MM-DD`. */
  dayKey: string;
  /** UAH (не копійки — ті самі одиниці, що й `spent`/`dayBudget` в Overview). */
  spent: number;
  /** Завжди скінченне число 0…1+ (контракт `useOverviewData.dailySpend`). */
  ratio: number;
  /** Акцент «перебору дня» — на власному порозі, не голому `ratio > 1`. */
  over120: boolean;
}

export interface MonthStripProps {
  days: MonthStripDay[];
  /** Київський день-ключ «сьогодні» — визначає межу минуле/сьогодні/майбутнє. */
  todayKey: string;
  /**
   * `null`, коли місячний план не заданий — тоді підпис клітинки не має
   * денного орієнтира («із X ₴»), лишається лише «витрачено X ₴».
   */
  dayBudget: number | null;
  showBalance: boolean;
  /** Відкриває операції конкретного дня (`/finyk/transactions?date=YYYY-MM-DD`). */
  onOpenDay: (dayKey: string) => void;
}

/** `"2026-09-01"` → `"вересня"` (родовий відмінок, UTC-anchored щоб не зʼїжджати на день). */
function monthGenitive(dayKey: string): string {
  const [y = 1970, m = 1] = dayKey.split("-").map(Number);
  const withDay = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  // "1 вересня" → "вересня": родовий відмінок місяця приходить лише в парі
  // з числом дня (сам по собі `month: "long"` дає називний "вересень").
  return withDay.replace(/^\d+\s*/, "");
}

/** `"2026-09-12"` → `"12 вересня"`, той самий UTC-anchored парс. */
function dayLabel(dayKey: string): string {
  const [y = 1970, m = 1, d = 1] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function cellAriaLabel(
  day: MonthStripDay,
  dayBudget: number | null,
  showBalance: boolean,
): string {
  const m = messages.finyk.monthStrip;
  const date = dayLabel(day.dayKey);
  if (!showBalance) return `${date}, ${m.hiddenAmount}. ${m.openDaySuffix}`;
  if (dayBudget !== null && dayBudget > 0) {
    return `${date}, ${formatMoney(day.spent)} ${m.ofJoiner} ${formatMoney(
      Math.round(dayBudget),
    )}. ${m.openDaySuffix}`;
  }
  return `${date}, ${m.spentPrefix} ${formatMoney(day.spent)}. ${m.openDaySuffix}`;
}

/**
 * Hero-стрічка місяця Фініка (спека `finyk-hero-month-strip.md`) — ряд
 * клітинок-кнопок, одна на день місяця. Минулі й сьогоднішній день
 * заповнені пропорційно `ratio` (висота бару, капована на 100%), майбутні —
 * порожні заповнювачі поза деревом доступності.
 *
 * AI-DANGER: 30–31 клітинка по 44px не влазять в один ряд на вузькому
 * екрані (31 × 44 = 1364px проти ~361px доступних), тож клітинка вужча за
 * 44px і несе `data-compact` — той самий opt-out із мобільного
 * touch-target-аудиту (`apps/web/tests/mobile/audit.ts`), що й у
 * `HabitHeatmap` Рутини. Кнопка лишається 44px ЗАВВИШКИ; ширина на
 * 393px-екрані виходить ~10.7px.
 *
 * Спокуса, яку тут уже пройшли і яку не можна повторювати: розширити
 * tap-target невидимою `absolute`-накладкою 44×44 поверх кожної клітинки.
 * Накладки сусідів перекриваються (44 > 10.7), а серед позиціонованих
 * елементів з `z-index: auto` hit-test виграє ОСТАННІЙ у DOM — тобто
 * накладка дня N+1 накриває візуальний центр дня N. Замір у Chromium на
 * 393px: 30 із 31 клітинки відкривали НЕ свій день, а наступний. Юніт-тести
 * цього не ловлять — `button.click()` б'є по вузлу напряму, повз геометрію.
 * Будь-яка накладка ширша за колонку відтворює цей баг, тож правильний
 * tap-target тут — сама клітинка.
 */
const MonthStripImpl = function MonthStrip({
  days,
  todayKey,
  dayBudget,
  showBalance,
  onOpenDay,
}: MonthStripProps) {
  const monthLabel = days[0] ? monthGenitive(days[0].dayKey) : "";

  return (
    <div
      role="group"
      aria-label={`${messages.finyk.monthStrip.groupAriaPrefix} ${monthLabel}`}
      className="flex items-end gap-px h-11"
    >
      {days.map((day) => {
        const isFuture = day.dayKey > todayKey;
        const isToday = day.dayKey === todayKey;

        if (isFuture) {
          return (
            <div
              key={day.dayKey}
              aria-hidden="true"
              className="flex-1 min-w-0 h-full rounded-[1px] bg-finyk-soft-border/40"
            />
          );
        }

        const fillPct = Math.round(Math.min(1, Math.max(0, day.ratio)) * 100);

        return (
          <button
            key={day.dayKey}
            type="button"
            data-compact
            data-today={isToday ? "true" : undefined}
            onClick={() => onOpenDay(day.dayKey)}
            aria-label={cellAriaLabel(day, dayBudget, showBalance)}
            className={cn(
              "relative flex-1 min-w-0 h-full",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-finyk",
              isToday && "ring-1 ring-finyk-strong dark:ring-finyk",
            )}
          >
            {/* Трек — окремий шар з `overflow-hidden` лише для скруглення
                бару, що росте знизу. */}
            <span className="absolute inset-0 rounded-[1px] bg-finyk-soft overflow-hidden">
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-0 bottom-0 transition-[height]",
                  day.over120 ? "bg-chart-finyk" : "bg-finyk/50",
                )}
                style={{ height: `${fillPct}%` }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
};

export const MonthStrip = memo(MonthStripImpl);
