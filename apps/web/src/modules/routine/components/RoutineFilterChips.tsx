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
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { FIZRUK_GROUP_LABEL } from "../lib/hubCalendarAggregate";
import { ROUTINE_THEME as C } from "../lib/routineConstants";

const COPY = messages.routine.filterChips;

const CHIP_BASE =
  "shrink-0 text-style-caption px-2.5 py-1.5 rounded-full border min-h-[44px] min-w-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CHIP_WRAPPING = "whitespace-normal break-words leading-snug";

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

  return (
    <div
      className="flex flex-nowrap overflow-x-auto gap-1.5 items-center pb-1 sm:flex-wrap sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
      <button
        type="button"
        aria-pressed={tagFilter === null}
        onClick={onClearFilter}
        className={cn(CHIP_BASE, tagFilter === null ? C.chipOn : C.chipOff)}
      >
        {COPY.all}
      </button>
      {showFizruk && (
        <button
          type="button"
          aria-pressed={tagFilter === "__fizruk"}
          onClick={() => toggle("__fizruk")}
          className={cn(
            CHIP_BASE,
            tagFilter === "__fizruk"
              ? "border-info/50 bg-info/10 text-text"
              : C.chipOff,
          )}
        >
          {FIZRUK_GROUP_LABEL}
        </button>
      )}
      {showFinykSubs && (
        <button
          type="button"
          aria-pressed={tagFilter === "__finyk_sub"}
          onClick={() => toggle("__finyk_sub")}
          className={cn(
            CHIP_BASE,
            CHIP_WRAPPING,
            "max-w-[75vw] sm:max-w-[200px]",
            tagFilter === "__finyk_sub"
              ? "border-success/40 bg-success/10 text-text"
              : C.chipOff,
          )}
        >
          {COPY.finykSubs}
        </button>
      )}
      {tagChips.map((name) => (
        <button
          key={name}
          type="button"
          aria-pressed={tagFilter === name}
          onClick={() => toggle(name)}
          className={cn(
            CHIP_BASE,
            CHIP_WRAPPING,
            "max-w-[70vw] sm:max-w-[160px]",
            tagFilter === name ? C.chipOn : C.chipOff,
          )}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
