/**
 * Last validated: 2026-05-19
 * Status: Active
 */
import { useEffect } from "react";
import { pluralDays } from "@sergeant/shared";
import { Card } from "@shared/components/ui/Card";
import {
  ANALYTICS_EVENTS,
  trackEvent,
} from "../../../core/observability/analytics";
import { DayProgress } from "./DayProgress";
import { RoutineMomentLine } from "./RoutineMomentLine";
import { DAY_TARGET } from "../../../core/insights/moments/moments";
import type { RoutineTimeMode } from "../context/RoutineCalendarContext";
import { useStreakFlame } from "../hooks/useStreakFlame";
import { claimStreakShownOnce, markStreakSeen } from "../lib/streakExposure";

/**
 * Назва зрізу для кікера героя. Раніше там був хардкод «Сьогоднішні звички»
 * на всі режими, тож «Сьогодні» і «Місяць» читались однаково — надто що в
 * режимі місяця заголовок теж показував сьогоднішню дату (репорт власника
 * 2026-08-17). Мод-залежний `rangeLabel` існував, але йшов лише в
 * `aria-label`, тобто його чув скрінрідер і не бачило око.
 *
 * Тут саме іменникові фрази, а не назви кнопок: кікер описує, ЩО за набір
 * показано, а конкретну дату чи діапазон дає заголовок під ним.
 */
const SLICE_LABEL: Record<RoutineTimeMode, string> = {
  today: "Сьогоднішні звички",
  tomorrow: "Звички на завтра",
  day: "Звички за день",
  week: "Звички за тиждень",
  month: "Звички за місяць",
};

/**
 * Порожній стан лічильника дня — той самий хардкод «на сьогодні», що і
 * `SLICE_LABEL` мав до 2026-08-17, лише тепер у прогрес-рядку: `dayProgress`
 * рахує `progressDayKey` (обраний день на today/tomorrow/day, інакше
 * сьогодні — тиждень/місяць не мають одного «дня прогресу»,
 * `useRoutineDerivedData`), а рядок називав його «сьогодні» завжди. На
 * «Завтра» це читалось як «на завтра немає жодної звички», хоча йшлось про
 * завтрашній день (аудит 2026-09, PR-R6).
 */
const DAY_PROGRESS_EMPTY_LABEL: Record<RoutineTimeMode, string> = {
  today: "Звичок на сьогодні ще немає",
  tomorrow: "Звичок на завтра ще немає",
  day: "Звичок на цей день ще немає",
  // Тиждень/місяць: `progressDayKey` лишається сьогоднішнім, тож текст тут
  // і далі правдивий.
  week: "Звичок на сьогодні ще немає",
  month: "Звичок на сьогодні ще немає",
};

export interface RoutineCalendarHeroProps {
  rangeLabel: string;
  timeMode: RoutineTimeMode;
  headlineDate: string;
  dayProgress: { completed: number; scheduled: number };
  filteredCount: number;
  activeHabitsCount: number;
  completionRate: { rate: number; completed: number; scheduled: number };
  currentStreak: number;
  onOpenDayReport: () => void;
}

/** H hero: progress count, N segments and one day-report entry. */
export function RoutineCalendarHero({
  rangeLabel,
  timeMode,
  headlineDate,
  dayProgress,
  currentStreak,
  onOpenDayReport,
}: RoutineCalendarHeroProps) {
  // «N з M виконано» тут не пишемо: те саме число вже стоїть у прогресі,
  // а список звичок одразу під героєм. Текстом лишається лише порожній день,
  // бо прогрес тоді показує тире.
  const streakText =
    currentStreak > 0
      ? `Найкраща серія ${currentStreak} ${pluralDays(currentStreak)}`
      : "";
  const metaText = [
    dayProgress.scheduled > 0 ? "" : DAY_PROGRESS_EMPTY_LABEL[timeMode],
    streakText,
  ]
    .filter(Boolean)
    .join(" · ");
  const flame = useStreakFlame(currentStreak);

  // Експозиція стріку (Хвиля 2, `routine_streak_shown`).
  //
  // ЛЕДЖЕР оновлюється на кожній зміні видимості/лічильника — він відповідає
  // на питання «коли полумʼя востаннє було на екрані». ПОДІЯ ж емітиться
  // рівно раз на (день пристрою, поверхню): цей екран ре-рендериться на
  // КОЖЕН toggle звички, і наївний emit роздув би знаменник у десятки разів,
  // обваливши conversion checkin/shown у нуль на рівному місці.
  //
  // ПОПЕРЕДЖЕННЯ ПРО ВИСНОВОК: `flame.visible === (streakDays > 0)`
  // (`useStreakFlame`), а полумʼя живе на тому ж екрані, що й чекбокси. Тому
  // зріз «бачив полумʼя vs ні» — це порівняння когорт «стрік > 0» і
  // «стрік = 0», а НЕ тест стимулу. Чесну варіацію дає лише
  // streak-record-карточка (вона їде як `value_signal_shown`,
  // `surface: "module"`). Не агрегувати обидві поверхні в один булеан.
  useEffect(() => {
    if (!flame.visible) return;
    markStreakSeen({ surface: "hero_flame", streakDays: flame.count });
    if (!claimStreakShownOnce("hero_flame")) return;
    trackEvent(ANALYTICS_EVENTS.ROUTINE_STREAK_SHOWN, {
      surface: "hero_flame",
      streak_days: flame.count,
      scope: "max_across_habits",
    });
  }, [flame.visible, flame.count]);

  // H replaces the flame glyph with text; keep the historical analytics
  // surface "hero_flame" so existing exposure/check-in funnels stay intact.
  return (
    <Card
      as="section"
      prominence={dayProgress.scheduled > 0 ? "hero" : "panel"}
      tone={dayProgress.scheduled > 0 ? "routine" : undefined}
      aria-label={rangeLabel}
    >
      <p
        className={
          dayProgress.scheduled > 0
            ? "text-style-overline text-routine-tint-label mb-2"
            : "text-style-overline text-muted mb-2"
        }
      >
        {SLICE_LABEL[timeMode]}
      </p>
      <DayProgress
        completed={dayProgress.completed}
        scheduled={dayProgress.scheduled}
        onClick={onOpenDayReport}
      />
      <p className="mt-3 text-style-label text-muted">{headlineDate}</p>
      {metaText && (
        <p className="mt-1 text-style-label text-muted">{metaText}</p>
      )}
      {timeMode === "today" && (
        <RoutineMomentLine target={DAY_TARGET} className="mt-2" />
      )}
    </Card>
  );
}
