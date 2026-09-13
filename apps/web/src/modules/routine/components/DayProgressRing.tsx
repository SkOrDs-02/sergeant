/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
const SIZE = 96;
const STROKE = 7;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface DayProgressRingProps {
  completed: number;
  scheduled: number;
  onClick?: () => void;
}

/**
 * Кільце прогресу дня в геро-блоці Рутини: дуга заповнення + число
 * `виконано/заплановано` всередині, під ним — вхід у денний звіт.
 *
 * Це ПЕРШИЙ рівень ієрархії екрана (рішення власника 2026-09-12, D1 крок 3):
 * предмет `/routine` — виконання дня, а календар із датою — навігатор до
 * нього, тож дата в `RoutineCalendarHero` стоїть другим рівнем.
 *
 * Геометрія фіксована (`SIZE` 96px, просвіт 82px), і саме тому число
 * набране нефлюїдною роллю — див. `AI-DANGER` біля нього.
 */
export function DayProgressRing({
  completed,
  scheduled,
  onClick,
}: DayProgressRingProps) {
  const ratio = scheduled > 0 ? completed / scheduled : 0;
  const offset = CIRCUMFERENCE * (1 - ratio);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 group cursor-pointer shrink-0"
      aria-label={`Прогрес дня: ${completed} з ${scheduled}. Тапни для денного звіту`}
    >
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="transform -rotate-90"
        >
          {/* «Чорнило» v3.1 § 3 — only rendered inside the routine hero's
              `ring` slot. `text-routine-strong`/`dark:text-routine`
              coincide almost exactly with the two ends of the new
              `--hero-grad-routine` gradient (same rose hues), so the
              arc would nearly vanish depending on ring position; the
              track/arc/label all use hero-ink for guaranteed contrast. */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            className="text-hero-ink/20"
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="text-hero-ink transition-colors duration-slowest ease-standard"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* Рішення власника 2026-09-12 (D1 крок 3): предмет цього екрана —
              ПРОГРЕС по дню, не сама дата, тож число читається першим, а дата
              в `RoutineCalendarHero` опущена до `title`.

              AI-DANGER: кегль тут ЗАЛЕЖИТЬ ВІД ДОВЖИНИ рядка, і обидві
              частини цього важливі.

              Нефлюїдний — бо кільце фіксоване (96px, просвіт 82px), а плинні
              ролі ростуть із вʼюпортом: плинний `headline` дає «10/12» 84.4px
              на 768 і 97.2px на 1280, тобто налазить на обведення.

              Digit-aware — бо стелі на кількість звичок немає
              (`calcRoutineDayProgress` рахує кожну активну заплановану), і
              «100/100» на 26px дає 104.3px. Один кегль не покриває обидва
              кінці: 26px переповнює на 7 гліфах, 20px на 3 гліфах втрачає
              перший рівень. Заміряно справжнім Manrope, будь-який вʼюпорт:

                гліфів   26px      20px
                3 «0/3»   42.0 ✓   32.3 ✓
                5 «10/12» 73.1 ✓   56.3 ✓
                7 «100/100» 104.3 ✕ 80.3 ✓

              Поріг — 5 гліфів. Компактний щабель лишається більшим за дату
              (`title` 18.0–19.6px) на 320/393/768; на 1280 дата 21.4px трохи
              більша, але 100+ звичок на десктопі — не той випадок, заради
              якого варто ламати кільце. */}
          <span
            className={cn(
              "text-hero-ink tabular-nums",
              `${completed}/${scheduled}`.length > 5
                ? "text-style-title-fixed"
                : "text-style-headline-fixed",
            )}
          >
            {completed}/{scheduled}
          </span>
        </div>
      </div>
      <span className="text-style-caption text-hero-ink/95 font-medium group-hover:text-hero-ink transition-colors">
        {messages.routine.dayReport}
      </span>
    </button>
  );
}
