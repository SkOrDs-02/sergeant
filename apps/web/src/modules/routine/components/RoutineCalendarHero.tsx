/**
 * Last validated: 2026-05-19
 * Status: Active
 */
import { useEffect } from "react";
import { pluralDays } from "@sergeant/shared";
import { Card } from "@shared/components/ui/Card";
import { StreakFlame } from "@shared/components/ui/StreakFlame";
import {
  ANALYTICS_EVENTS,
  trackEvent,
} from "../../../core/observability/analytics";
import { DayProgressRing } from "./DayProgressRing";
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

/**
 * Top "hero" card for the Routine calendar tab. Uses the v2 hero Card
 * shell (prominence="hero" module="routine" radius="xl") with:
 *
 *   - `HeroValueLine` — narrative sentence (date · progress · streak),
 *     animated `CounterReveal` metric, and the `DayProgressRing` (ring
 *     slot, clickable to open the day-report sheet).
 *   - `KpiRowCompact` — one-row compact meta strip: events in range,
 *     active habits, completion %, current streak.
 *
 * Props interface is unchanged from v1; all call sites remain compatible.
 */
export function RoutineCalendarHero({
  rangeLabel,
  timeMode,
  headlineDate,
  dayProgress,
  currentStreak,
  onOpenDayReport,
}: RoutineCalendarHeroProps) {
  // «N з M виконано» тут не пишемо: те саме число вже стоїть у кільці поруч,
  // а список звичок одразу під героєм. Текстом лишається лише порожній день,
  // бо кільце тоді показує тире.
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

  /*
    AI-CONTEXT: у `Card` нижче НЕМА пропа `edge` — і це рішення, а не
    пропуск.

    «Край і зріз» (П3) — матеріал ЗАПИСІВ І ЗВІТІВ; межу зафіксовано
    рішенням власника 2026-08-07, див. `docs/design/design/anti-slop-strategy.md`
    §4/П3. Тест простий: чи існує ця річ у житті як аркуш. Операція —
    так (чек), тижневий дайджест — так. А це календарний навігатор:
    керівна поверхня, якою обирають діапазон. Аркушем вона не є.

    Край тут стояв від першої хвилі застосування, ще до того, як межу
    сформулювали. Знято, бо перший же виняток розмиває тест, а без тесту
    матеріал за пару ітерацій розповзеться на всю оболонку й перестане
    щось означати — рівно доля скруглення (§3.2/3).
  */
  return (
    <Card
      as="section"
      prominence="hero"
      module="routine"
      aria-label={rangeLabel}
      className="routine-hero relative"
    >
      {flame.visible && (
        <span
          className="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-hidden="true"
        >
          <StreakFlame streak={flame.count} size="sm" />
        </span>
      )}
      <div className="flex flex-row items-center gap-4 sm:gap-6">
        <div className="flex shrink-0 items-center justify-center">
          <DayProgressRing
            completed={dayProgress.completed}
            scheduled={dayProgress.scheduled}
            onClick={onOpenDayReport}
          />
        </div>
        {/* Місце під вогник лише тоді, коли він є: без серії 48px фантому
            на 320-360px загортали дату в 2-3 рядки. */}
        <div
          className={flame.visible ? "min-w-0 flex-1 pr-12" : "min-w-0 flex-1"}
        >
          <p className="text-style-caption font-semibold text-hero-ink">
            {SLICE_LABEL[timeMode]}
          </p>
          {/* Дата — ДРУГИЙ рівень: рішення власника 2026-09-12 (D1 крок 3).
              Перший віддано числу прогресу в кільці (`DayProgressRing`), бо
              предмет екрана — виконання дня, а календар — навігатор до нього.
              Кільце стоїть поруч із датою, тож тримати обидва на `headline`
              означало б два перші рівні пліч-о-пліч, а це проти правила 1
              `density-hierarchy-spec.md`. */}
          <p className="mt-1 text-style-title text-hero-ink">{headlineDate}</p>
          {/* `currentStreak` = `flexibleMaxActiveStreak`: максимум СЕРЕД
              звичок, не «тримаю все N днів» (телеметрія чесно шле
              `scope: "max_across_habits"`, аудит 2026-09, PR-R10). «Найкраща»
              називає це без імені звички (founder-рішення 2026-08-30,
              `useStreakRecordPendingInsight`: без підстановки назви). */}
          {metaText && (
            <p className="mt-1 text-style-label text-hero-ink">{metaText}</p>
          )}
          {timeMode === "today" && (
            <RoutineMomentLine
              target={DAY_TARGET}
              className="mt-1 text-hero-ink dark:text-hero-ink"
            />
          )}
        </div>
      </div>
    </Card>
  );
}
