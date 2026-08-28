/**
 * Last validated: 2026-08-03
 * Status: Active
 */
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { IconButton } from "@shared/components/ui/IconButton";
import {
  addDays,
  dateKeyFromDate,
  parseDateKey,
  startOfIsoWeek,
} from "../lib/weekUtils";

function weekKeysFromAnchor(anchorKey: string): string[] {
  const s = startOfIsoWeek(parseDateKey(anchorKey));
  return Array.from({ length: 7 }, (_, i) => dateKeyFromDate(addDays(s, i)));
}

export interface WeekDayStripProps {
  anchorKey: string;
  selectedDay: string;
  todayKey: string;
  onSelectDay: (dateKey: string) => void;
}

export function WeekDayStrip({
  anchorKey,
  selectedDay,
  todayKey,
  onSelectDay,
}: WeekDayStripProps) {
  const keys = weekKeysFromAnchor(anchorKey);
  const short = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
  // Повна назва для aria-label: скорочення «Пн» + число в innerText SR
  // читає як «Пн 3» без місяця — недостатньо для навігації по тижнях.
  const full = [
    "Понеділок",
    "Вівторок",
    "Середа",
    "Четвер",
    "Пʼятниця",
    "Субота",
    "Неділя",
  ];

  return (
    /* AI-DANGER: тут НЕМАЄ горизонтального скролера — і це фікс, не стиль.
       На iOS скрол-контейнер отримує композиторний шар, у якому
       перемальовка лягає зі ЗСУВОМ: при зміні виділення заливка попередньо
       обраного дня лишалась на екрані рожевою смугою впоперек сусіднього
       ПРАВОРУЧ (обрано 17 — підфарбоване 18).

       Механізм доведено двома експериментами власника 2026-08-17. Перший:
       у двох рядах чипів «Рутини» скролер прибрано — смуги там зникли, а в
       цій стрічці, де скролер лишили як контроль, лишились. Другий, ще
       точніший: клік по самій даті смуг НЕ дає, а клік по чипу
       «Завтра»/«Тиждень» — дає. Тобто ламається саме перемальовка, яку
       спричинили ЗЗОВНІ, без дотику до скролера: тоді його шар не
       інвалідується. `will-change: transform` цього не полагодив.

       Тому сітка замість скролера: `grid-cols-4` на телефонах (два рядки,
       4+3) і `sm:grid-cols-7` в один рядок від 640px. Клітинки тягнуться на
       всю ширину, 44px-флор не порушено — заміряно, що семи клітинкам по
       44px потрібно 344px, а доступно лише 232px на екрані 390px, тож у
       ОДИН рядок вони на телефоні не влазять ні зі скролом, ні без.
       Побічний виграш: Сб і Нд більше не за кадром.

       Шеврони переїхали у рядок заголовка — `WeekShiftControls` нижче. */
    <div role="group" aria-label="Тиждень">
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7 sm:gap-2">
        {keys.map((k, i) => {
          const isSel = k === selectedDay;
          const isToday = k === todayKey;
          const dom = Number(k.slice(8, 10));
          return (
            <button
              key={k}
              type="button"
              aria-pressed={isSel}
              aria-label={`${full[i]}, ${k}${isToday ? " (сьогодні)" : ""}`}
              onClick={() => onSelectDay(k)}
              className={cn(
                // Розміру шрифта на кнопці НЕМАЄ навмисно: обидва вкладені
                // span-и задають свій (`text-style-caption` і `text-sm`),
                // тож роль на батьку не діяла ні на що — крім того, що
                // вступала в конфлікт ваги з `font-semibold` тут-таки.
                // `sm:text-xs` було мертвим кодом: 12px == 12px.
                // `w-full` замість `flex-1 shrink-0`: клітинка тепер осередок
                // grid-а, а не flex-елемент, тож тягнеться на всю колонку.
                // `min-w-[44px]` лишається як floor на найвужчих екранах.
                "focus-ring flex min-h-[44px] w-full min-w-[44px] flex-col items-center justify-center rounded-xl border py-1 font-semibold",
                isSel
                  ? "border-routine-ring dark:border-routine-border-dark/40 bg-routine-surface2 dark:bg-routine-surface-dark/15 text-text shadow-sm ring-1 ring-routine-line/50 dark:ring-routine-border-dark/30"
                  : "border-transparent bg-panelHi/50 text-muted hover:bg-panelHi hover:text-text",
                isToday && !isSel && "ring-1 ring-routine/40",
              )}
            >
              {/* AI-DANGER: капс тут лишається навмисно, попри правило 4
                    типографіки тексту. Правило бʼє по кікерах — службових
                    рядках зі СЛІВ, які втрачають силует у верхньому
                    регістрі. Тут дволітерні скорочення днів (Пн, Вт), у
                    яких силуету немає в жодному регістрі, а капс тримає
                    рівну висоту в сітці календаря. Не «дочищай». */}
              <span className="text-style-caption uppercase tracking-wide text-subtle">
                {short[i]}
              </span>
              <span className="tabular-nums text-sm text-text">{dom}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface WeekShiftControlsProps {
  onShiftWeek: (delta: number) => void;
}

/**
 * Кнопки «попередній / наступний тиждень». Жили в одному рядку з днями,
 * але з переходом стрічки на сітку (див. `AI-DANGER` вище) переїхали в
 * рядок заголовка «Тиждень»: у ряду днів вони забирали 100px із 332
 * доступних і були головною причиною, чому сім клітинок туди не влазили.
 */
export function WeekShiftControls({ onShiftWeek }: WeekShiftControlsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <IconButton
        size="md"
        variant="ghost"
        className="focus-ring shrink-0 rounded-xl border border-line bg-panel/90 text-muted"
        onClick={() => onShiftWeek(-1)}
        aria-label="Попередній тиждень"
      >
        <Icon name="chevron-left" size="sm" />
      </IconButton>
      <IconButton
        size="md"
        variant="ghost"
        className="focus-ring shrink-0 rounded-xl border border-line bg-panel/90 text-muted"
        onClick={() => onShiftWeek(1)}
        aria-label="Наступний тиждень"
      >
        <Icon name="chevron-right" size="sm" />
      </IconButton>
    </div>
  );
}
