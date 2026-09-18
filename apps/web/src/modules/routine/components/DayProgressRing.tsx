/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { messages } from "@shared/i18n/uk";
const SIZE = 96;
const STROKE = 7;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Метрики для підгонки числа під просвіт кільця. Просвіт — `SIZE − 2×STROKE`
 * (82px), мінус 2px запасу з кожного боку. Ширини гліфів — частки em під
 * `tabular-nums` у Manrope 700, заміряні рендером; слеш вужчий за цифру, тож
 * рахувати «гліф × коефіцієнт» не можна (похибка росте з довжиною).
 */
const RING_APERTURE_PX = SIZE - 2 * STROKE - 4;
const DIGIT_EM = 0.6;
const SLASH_EM = 0.4131;
const RING_MAX_FONT_PX = 26; // = `.text-style-headline-fixed`
const RING_MIN_FONT_PX = 12; // текстова підлога системи

function fitRingFontPx(value: string): number {
  const digits = value.length - 1; // рівно один слеш
  const emWidth = digits * DIGIT_EM + SLASH_EM;
  // Округлення саме ВНИЗ. `Math.round` виводив «1000/1000» на 15.0px (78.2px)
  // і «12345/12345» на 12.2px (78.2px) — тобто за просвіт, хоч обидва вище
  // підлоги й мали вміститись формулою. Доти кліпера не було і 0.2px нічого
  // не значили (справжній просвіт 82); щойно з'явилась тверда межа 78, та сама
  // соті-частка почала різати. Знахідка рев'ю на #1119 — про взаємодію двох
  // моїх власних правок, не про жодну з них окремо.
  return Math.max(
    RING_MIN_FONT_PX,
    Math.min(
      RING_MAX_FONT_PX,
      Math.floor((RING_APERTURE_PX / emWidth) * 10) / 10,
    ),
  );
}

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
  const ringFontSize = fitRingFontPx(`${completed}/${scheduled}`);

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

              AI-DANGER: кегль ОБЧИСЛЮЄТЬСЯ під довжину рядка, і повертати
              сюди сталу роль не можна — ні плинну, ні фіксовану.

              Плинна не годиться, бо кільце фіксоване (96px, просвіт 82px), а
              плинні ролі ростуть із вʼюпортом: плинний `headline` дає «10/12»
              97.2px на 1280, тобто налазить на обведення.

              Стала не годиться, бо стелі на кількість звичок немає
              (`applyCreateHabit` не обмежує, `calcRoutineDayProgress` рахує
              кожну активну заплановану). Будь-яке СТАЛЕ значення має обрив,
              лише на різній довжині: 26px ламається на 7 гліфах, 20px — на 9.
              Це знайшло рев'ю після того, як я вже «полагодив» перший обрив
              порогом — поріг його не прибирає, а пересуває.

              Формула точна, не емпірична: під `tabular-nums` цифра має сталу
              ширину 0.6000em, слеш — 0.4131em (заміряно справжнім Manrope на
              100px; передбачення сходиться з рендером до 0.0px на «0/3»,
              «100/100» і «1000/1000»). Звідси ширина рядка лінійна, і кегль,
              що вміщує будь-яку довжину, рахується прямо.

                «0/3» → 26.0px    «100/100» → 19.4px
                «10/12» → 26.0px  «1000/1000» → 14.9px

              Підлога 12px — текстова підлога системи, і НИЖЧЕ ЗА НЕЇ формула
              вже не рятує: «123456/123456» на 12px дає ~91px при просвіті 82.
              Тому підлогу страхує кліпер — `maxWidth` на просвіт плюс
              `overflow-hidden`. Без нього рядок не «обрізався б», як тут
              спершу було записано, а наліз би на обведення кільця: у
              `<span>` не було ні межі ширини, ні `overflow` (знахідка рев'ю
              на #1119 — я задокументував поведінку, якої в коді не існувало).
              Зміст при цьому не губиться: повне значення несе `aria-label`
              кнопки. */}
          <span
            className="text-style-headline-fixed text-hero-ink tabular-nums overflow-hidden text-center"
            style={{
              maxWidth: `${RING_APERTURE_PX}px`,
              ...(ringFontSize < RING_MAX_FONT_PX
                ? { fontSize: `${ringFontSize}px` }
                : {}),
            }}
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
