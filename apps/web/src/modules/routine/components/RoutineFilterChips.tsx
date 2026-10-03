/**
 * Last validated: 2026-08-03
 * Status: Active
 *
 * Рядок чипів-фільтрів над стрічкою подій «Огляду».
 *
 * Витягнуто з `RoutineCalendarPanel` (Hard Rule #18 — `max-lines: 600`).
 *
 * AI-CONTEXT: у цьому рядку живуть НЕ лише теги. `tagLabelsForHabit`
 * (`@sergeant/routine-domain` → `calendarEvents.ts`) додає в `tagLabels`
 * і назву категорії звички, тож чип категорії фільтрує так само, як чип
 * тега. Через це заголовок «Теги» брехав — тепер це «Фільтр».
 */
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import { Button } from "@shared/components/ui/Button";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { FIZRUK_GROUP_LABEL } from "../lib/hubCalendarAggregate";

const COPY = messages.routine.filterChips;

// Чип — це той самий `Button`, що й решта контролів модуля: обраний —
// solid у тоні Рутини, решта — outline з hairline модуля. Власна розмітка
// пігулки прибрана (анти-слоп, chip-scroller як дефолтний фільтр); 44px на
// coarse pointer дає сам Button.
const CHIP_OFF = "border-routine/40";
// Довгий тег переноситься рядком, тож фіксована висота `size="xs"` знята.
const CHIP_WRAPPING =
  "h-auto min-h-8 py-1.5 whitespace-normal break-words leading-snug text-left";

export interface RoutineFilterChipsProps {
  tagFilter: string | null;
  setTagFilter: (updater: (prev: string | null) => string | null) => void;
  onClearFilter: () => void;
  tagChips: readonly string[];
  showFizruk: boolean;
  showFinykSubs: boolean;
}

export function RoutineFilterChips({
  tagFilter,
  setTagFilter,
  onClearFilter,
  tagChips,
  showFizruk,
  showFinykSubs,
}: RoutineFilterChipsProps) {
  const toggle = (value: string) =>
    setTagFilter((f) => (f === value ? null : value));

  // AI-CONTEXT: атрактор №7 §3.2 — `tagChips` тепер обмежений тегами
  // ПОТОЧНОГО періоду (useRoutineDerivedData.ts), тож зміна періоду може
  // вивести активний тег-фільтр за межі списку чипів. Без цього блоку чип
  // просто зникав і людина не могла зняти фільтр, навіть не бачачи, який
  // він активний. Прецедент — знімний чип `activeCategoryLabel` у
  // `TransactionFilters` (Фінік): показуємо назву фільтра окремим знімним
  // чипом, замість мовчазного зникнення.
  const isKnownSpecial =
    tagFilter === "__fizruk" || tagFilter === "__finyk_sub";
  const orphanTagFilter =
    tagFilter !== null && !isKnownSpecial && !tagChips.includes(tagFilter)
      ? tagFilter
      : null;

  return (
    <div
      // AI-DANGER: `flex-wrap` без скролера на всіх ширинах — навмисно.
      // Раніше на мобільному тут був `overflow-x-auto`, який створював
      // композиторний шар; iOS малював його зі зсувом, і заливка активного
      // чипа зʼявлялась на сусідньому. Кількість тег-чипів змінна, тож
      // перенос рядком — правильніша поведінка, ніж горизонтальний скрол.
      // Деталі механізму — у `RoutineCalendarPanel` біля `<Segmented>`.
      className="flex flex-wrap gap-1.5 items-center pb-1"
      role="group"
      aria-label={COPY.groupLabel}
    >
      <SectionHeading
        as="span"
        size="xs"
        className="shrink-0 sm:w-auto"
        variant="routine"
      >
        {COPY.heading}
      </SectionHeading>
      <Button
        size="xs"
        variant={tagFilter === null ? "solid" : "outline"}
        tone={tagFilter === null ? "routine" : "neutral"}
        aria-pressed={tagFilter === null}
        onClick={onClearFilter}
        className={cn("shrink-0", tagFilter !== null && CHIP_OFF)}
      >
        {COPY.all}
      </Button>
      {showFizruk && (
        // Джерело з іншого модуля позначає статусний тон, не чужий акцент
        // (module-accent containment): info для Фізрука, success для
        // підписок Фініка.
        <Button
          size="xs"
          variant="outline"
          tone="neutral"
          aria-pressed={tagFilter === "__fizruk"}
          onClick={() => toggle("__fizruk")}
          className={cn(
            "shrink-0",
            tagFilter === "__fizruk"
              ? "border-info/50 bg-info/10 text-text"
              : CHIP_OFF,
          )}
        >
          {FIZRUK_GROUP_LABEL}
        </Button>
      )}
      {showFinykSubs && (
        <Button
          size="xs"
          variant="outline"
          tone="neutral"
          aria-pressed={tagFilter === "__finyk_sub"}
          onClick={() => toggle("__finyk_sub")}
          className={cn(
            "shrink-0",
            CHIP_WRAPPING,
            "max-w-[75vw] sm:max-w-[200px]",
            tagFilter === "__finyk_sub"
              ? "border-success/40 bg-success/10 text-text"
              : CHIP_OFF,
          )}
        >
          {COPY.finykSubs}
        </Button>
      )}
      {tagChips.map((name) => (
        <Button
          key={name}
          size="xs"
          variant={tagFilter === name ? "solid" : "outline"}
          tone={tagFilter === name ? "routine" : "neutral"}
          aria-pressed={tagFilter === name}
          onClick={() => toggle(name)}
          className={cn(
            "shrink-0",
            CHIP_WRAPPING,
            "max-w-[70vw] sm:max-w-[160px]",
            tagFilter !== name && CHIP_OFF,
          )}
        >
          {name}
        </Button>
      ))}
      {orphanTagFilter && (
        <Button
          size="xs"
          variant="soft"
          tone="routine"
          onClick={onClearFilter}
          className={cn(
            "shrink-0",
            CHIP_WRAPPING,
            "max-w-[70vw] sm:max-w-[160px]",
          )}
        >
          {orphanTagFilter}
          <span aria-hidden> ×</span>
          <span className="sr-only">{COPY.clearTagFilter}</span>
        </Button>
      )}
    </div>
  );
}
