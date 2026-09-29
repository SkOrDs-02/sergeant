/**
 * Last validated: 2026-09-17
 * Status: Active
 */
import type { ChangeEvent } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { Segmented } from "@shared/components/ui/Segmented";
import { searchFieldProps } from "@shared/lib/ui/searchFieldProps";
import { WeekDayStrip, WeekShiftControls } from "./WeekDayStrip";
import { RoutineFilterChips } from "./RoutineFilterChips";
import { messages } from "@shared/i18n/uk";
import {
  ROUTINE_TIME_MODES as TIME_MODES,
  type RoutineTimeModeId,
} from "../lib/routineConstants";
import type {
  RoutineCalendarData,
  RoutineCalendarActions,
} from "../context/RoutineCalendarContext";

const timeModeItems: ReadonlyArray<{
  value: RoutineTimeModeId;
  label: string;
}> = TIME_MODES.map((tm) => ({ value: tm.id, label: tm.label }));

export interface RoutineFeedControlsProps {
  timeMode: RoutineCalendarData["timeMode"];
  applyTimeMode: RoutineCalendarActions["applyTimeMode"];
  selectedDay: string;
  todayKey: string;
  tomorrowKey: string;
  shiftWeekStrip: RoutineCalendarData["shiftWeekStrip"];
  setSelectedDay: RoutineCalendarData["setSelectedDay"];
  setTimeMode: RoutineCalendarData["setTimeMode"];
  listQueryDraft: string;
  setListQueryDraft: (v: string) => void;
  tagFilter: string | null;
  setTagFilter: RoutineCalendarData["setTagFilter"];
  tagChips: RoutineCalendarData["tagChips"];
  showFizruk: boolean;
  showFinykSubs: boolean;
}

/**
 * Пульт фільтрації стрічки Рутини: діапазон, тижневий пікер, пошук і чипи
 * джерел.
 *
 * Винесено з `RoutineCalendarPanel` з двох причин одразу. Перша механічна —
 * панель уперлась у `max-lines: 600` (Hard Rule #18), і правило вимагає
 * ділити ДО перетину. Друга змістовна: у пульта є власна умова показу, і
 * окремий компонент робить її видимою з назви файлу, а не ховає серед
 * шести сотень рядків панелі.
 *
 * Ховається рівно тоді, коли показується порожній стан «Почни з однієї
 * звички», тобто `listIsEmpty && !hasListFilter && hasNoHabits`. Аудит
 * 2026-09-16: у цьому стані над списком, у якому нема чого фільтрувати,
 * рендерилось 18 контролів — чотири чипи діапазону, тижневий пікер із сімома
 * днями і двома шевронами, пошук і три чипи джерел; головна дія при цьому
 * лишалась у FAB.
 *
 * Чому предикат саме такий, а не просто `hasNoHabits`. Стрічка Рутини
 * показує НЕ ЛИШЕ звички — туди приходять тренування Фізрука й підписки
 * Фініка (див. чипи джерел нижче). Тобто користувач без жодної звички, але
 * із запланованим тренуванням, має що гортати, і забирати в нього діапазон
 * із тижневим пікером не можна. Перший варіант гейта стояв на голому
 * `hasNoHabits` і саме це й робив; зловив це смоук
 * `routine-smoke.spec.ts:114`, який перемикає діапазони на свіжому
 * профілі.
 *
 * Друга половина предиката так само обовʼязкова: `!hasListFilter`. Коли
 * звички є, а фільтр нічого не знайшов, пульт мусить лишитись — інакше
 * зняти той фільтр буде нічим.
 */
const M = messages.routine.feedControls;

export function RoutineFeedControls({
  timeMode,
  applyTimeMode,
  selectedDay,
  todayKey,
  tomorrowKey,
  shiftWeekStrip,
  setSelectedDay,
  setTimeMode,
  listQueryDraft,
  setListQueryDraft,
  tagFilter,
  setTagFilter,
  tagChips,
  showFizruk,
  showFinykSubs,
}: RoutineFeedControlsProps) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        {/* Без підпису голий ряд «Сьогодні / Завтра / Тиждень / Місяць»
            читався як перемикач статистики, хоча фільтрує стрічку (репорт
            тестера 2026-08-17). */}
        <SectionHeading as="p" size="xs" variant="routine">
          {M.heading}
        </SectionHeading>

        <Segmented
          style="soft"
          size="sm"
          variant="routine"
          ariaLabel={M.rangeAriaLabel}
          // AI-DANGER: без `overflow-x-auto` навмисно. Чотири чипи діапазону
          // вміщаються в найвужчий підтримуваний екран, а якщо колись не
          // вмістяться — перенесуться рядком (`flex-wrap` у `Segmented`).
          // Горизонтальний скролер тут не потрібен, зате він створював
          // композиторний шар, який iOS малював зі зсувом: заливка обраного
          // чипа зʼявлялась на сусідньому ПРАВОРУЧ (обрано «Тиждень» —
          // рожевий «Місяць»). Репорт власника 2026-08-17, підтверджено
          // зсувом на двох незалежних рядах.
          className="[&>button]:shrink-0"
          items={timeModeItems}
          value={timeMode}
          onChange={applyTimeMode}
        />
      </div>

      <Card variant="default" radius="lg" padding="sm" className="bg-panel/80">
        {/* Шеврони тут, а не в ряду днів: там вони забирали 100px і не давали
    сімці клітинок влізти без скролера (див. `WeekDayStrip`). */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <SectionHeading as="p" size="xs" variant="routine">
            {M.weekHeading}
          </SectionHeading>
          <WeekShiftControls onShiftWeek={shiftWeekStrip} />
        </div>
        <WeekDayStrip
          anchorKey={selectedDay}
          selectedDay={selectedDay}
          todayKey={todayKey}
          onSelectDay={(k) => {
            setSelectedDay(k);
            // Стрічка узгоджена з чипами: тап по сьогоднішній даті дає режим
            // `today`, по завтрашній — `tomorrow`, і лише довільний день —
            // `day`. Раніше будь-який тап давав `day`, тож навіть після
            // вибору СЬОГОДНІ знизу висів припис «Обрано один день…», і
            // зняти його можна було тільки чипом (репорт власника
            // 2026-08-17). Діапазон від цього не змінюється: для
            // `today`/`tomorrow` він такий самий однодневний, як для `day`
            // із тією ж датою (`useRoutineDerivedData` § range).
            setTimeMode(
              k === todayKey ? "today" : k === tomorrowKey ? "tomorrow" : "day",
            );
          }}
        />
        {timeMode === "day" && (
          // AI-NOTE: `text-style-caption` тут навмисно — це підказка під
          // контролом (пояснення, як зняти обраний день), а не текст, який
          // читають. Виняток, прямо передбачений правилом
          // `sergeant-design/no-sentence-in-caption`. Правило спрацювало лише
          // тепер, бо файл уперше потрапив у staged-набір — сам рядок живе в
          // `main` з репорту власника 2026-08-17.
          <p className="mt-2 text-center text-style-caption text-subtle">
            {M.singleDayHint}
          </p>
        )}
      </Card>

      <Input
        className="routine-touch-field w-full max-w-md"
        {...searchFieldProps("routine-feed-search")}
        placeholder={M.searchPlaceholder}
        value={listQueryDraft}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          setListQueryDraft(e.target.value)
        }
        aria-label={M.searchAriaLabel}
      />

      <RoutineFilterChips
        tagFilter={tagFilter}
        setTagFilter={setTagFilter}
        onClearFilter={() => setTagFilter(null)}
        tagChips={tagChips}
        showFizruk={showFizruk}
        showFinykSubs={showFinykSubs}
      />
    </>
  );
}
