import {
  memo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { formatMoney } from "@sergeant/shared";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import { Icon } from "@shared/components/ui/Icon";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { formatDayMonth } from "@shared/lib/time/formatDate";

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
  // "1 вересня" → "вересня": родовий відмінок місяця приходить лише в парі
  // з числом дня (сам по собі `month: "long"` дає називний "вересень"), тож
  // форматуємо фіктивне перше число й зрізаємо його.
  const withDay = formatDayMonth(new Date(Date.UTC(y, m - 1, 1)), {
    timeZone: "UTC",
  });
  return withDay.replace(/^\d+\s*/, "");
}

/** `"2026-09-12"` → `"12 вересня"`, той самий UTC-anchored парс. */
function dayLabel(dayKey: string): string {
  const [y = 1970, m = 1, d = 1] = dayKey.split("-").map(Number);
  return formatDayMonth(new Date(Date.UTC(y, m - 1, d)), { timeZone: "UTC" });
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
  const lastDay = days.length;

  // Roving tabindex: смуга — ОДНА зупинка табуляції, стрілки ходять по днях.
  //
  // До цього кожен день був власною зупинкою, тобто до першого контентного
  // контрола на `/finyk` треба було натиснути Tab тридцять разів (аудит
  // 2026-09-16: 30 із 40 клікабельних елементів сторінки — це ця смуга).
  // Тап нічого не втрачає: кнопки лишаються кнопками, змінюється лише те,
  // скільки з них видно клавіатурі одночасно.
  const interactiveKeys = days
    .filter((d) => d.dayKey <= todayKey)
    .map((d) => d.dayKey);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // Поточна зупинка: явно обраний день, інакше сьогодні, інакше останній
  // доступний. Обчислюємо щоразу, бо місяць змінюється під ногами.
  const fallbackKey = interactiveKeys.includes(todayKey)
    ? todayKey
    : (interactiveKeys[interactiveKeys.length - 1] ?? null);
  const tabStopKey =
    activeKey && interactiveKeys.includes(activeKey) ? activeKey : fallbackKey;

  const moveTo = (nextKey: string | undefined) => {
    if (!nextKey) return;
    setActiveKey(nextKey);
    // Фокус переносимо вручну: `tabIndex` міняється в тому ж рендері, а
    // браузер сам фокус не переставляє.
    stripRef.current
      ?.querySelector<HTMLButtonElement>(`[data-day-key="${nextKey}"]`)
      ?.focus();
  };

  const onStripKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!tabStopKey) return;
    const i = interactiveKeys.indexOf(tabStopKey);
    if (i === -1) return;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        moveTo(interactiveKeys[Math.max(0, i - 1)]);
        break;
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        moveTo(interactiveKeys[Math.min(interactiveKeys.length - 1, i + 1)]);
        break;
      case "Home":
        e.preventDefault();
        moveTo(interactiveKeys[0]);
        break;
      case "End":
        e.preventDefault();
        moveTo(interactiveKeys[interactiveKeys.length - 1]);
        break;
      default:
        break;
    }
  };

  return (
    <div>
      <div
        ref={stripRef}
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
              data-day-key={day.dayKey}
              data-today={isToday ? "true" : undefined}
              tabIndex={day.dayKey === tabStopKey ? 0 : -1}
              // Слухач на самій кнопці, а не на контейнері `role="group"`:
              // контейнер не інтерактивний, і вішати на нього клавіатуру
              // забороняє `jsx-a11y/no-noninteractive-element-interactions`.
              // Для roving tabindex різниці немає — фокус завжди всередині.
              onKeyDown={onStripKeyDown}
              onFocus={() => setActiveKey(day.dayKey)}
              onClick={() => onOpenDay(day.dayKey)}
              aria-label={cellAriaLabel(day, dayBudget, showBalance)}
              className={cn(
                "relative flex-1 min-w-0 h-full",
                // Стрічка лежить на hero-градієнті модуля: контур кольору Фініка
                // (`#115e59`) зливався з початком градієнта (≈1.0:1, follow-up
                // аудиту контрасту 2026-10-01). Чорнило hero-картки тримає ≥4.7:1
                // проти кожної зупинки в обох темах.
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-hero-ink",
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
      {/* Вісь днів. Без неї стрічка читалась як абстрактна гістограма —
          «що це за стовпчики?» (звіт власника 2026-09-03). Три мітки, а не
          31: числа під кожною клітинкою на 10 px ширини не вміщаються. */}
      {lastDay > 0 && (
        <div
          aria-hidden="true"
          className="mt-1 flex justify-between text-style-caption text-hero-ink tabular-nums"
        >
          <span>1</span>
          <span>{Math.ceil(lastDay / 2)}</span>
          <span>{lastDay}</span>
        </div>
      )}
    </div>
  );
};

export const MonthStrip = memo(MonthStripImpl);

const STRIP_HINT_DISMISSED_SLOT = "finyk_month_strip_hint_dismissed_v1";

/**
 * Одноразова підказка під стрічкою: що таке стовпчики і як їх читати.
 * Показується, доки людина її не закриє; після цього стрічка вже знайома,
 * і постійна легенда стала б шумом у hero.
 */
export function MonthStripHint({
  hasPlan,
  suppressed = false,
}: {
  hasPlan: boolean;
  /** N-3 (аудит 2026-09-16): одна навчальна картка на екран - заглушується, поки видимий `FirstInsightBanner`. */
  suppressed?: boolean;
}) {
  const [dismissed, setDismissed] = useState<boolean>(
    () => safeReadLS<boolean>(STRIP_HINT_DISMISSED_SLOT, false) ?? false,
  );
  if (dismissed || suppressed) return null;
  const m = messages.finyk.monthStrip;
  return (
    <div
      role="note"
      className="mt-2 flex items-start gap-2 rounded-xl border border-hero-ink/15 bg-hero-ink/5 px-3 py-2 text-style-caption text-hero-ink"
    >
      <span className="min-w-0 flex-1 leading-snug">
        {hasPlan ? m.hintWithPlan : m.hintNoPlan}
      </span>
      <button
        type="button"
        onClick={() => {
          safeWriteLS(STRIP_HINT_DISMISSED_SLOT, true);
          setDismissed(true);
        }}
        aria-label={m.hintDismiss}
        className="touch-target -m-2 inline-flex shrink-0 items-center justify-center rounded-full p-2 text-hero-ink hover:bg-hero-ink/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
      >
        <Icon name="close" size="sm" aria-hidden />
      </button>
    </div>
  );
}
