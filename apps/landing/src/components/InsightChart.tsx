/**
 * Міні-чарт героя: 6 тижнів, стовпчики тренувань проти крапок доставки.
 * Показує САМ інсайт (обернену динаміку), а не декоративну схему — форма
 * від даних, головний диференціатор продукту (DESIGN.md § Slop-тест).
 */
const WEEKS = [
  { workouts: 4, deliveries: 1 },
  { workouts: 3, deliveries: 2 },
  { workouts: 2, deliveries: 2 },
  { workouts: 0, deliveries: 4 },
  { workouts: 1, deliveries: 3 },
  { workouts: 4, deliveries: 1 },
];

const BASE_Y = 120;
const STEP_X = 98;
const BAR_W = 18;

export default function InsightChart() {
  return (
    <div className="flex flex-col gap-2.5">
      {/*
        Тижневі підписи (Т1…Т6) навмисно НЕ живуть у <text> всередині SVG:
        viewBox масштабується по ширині контейнера, тож fontSize у SVG-units
        стискався б разом із графікою і на 390px-екрані падав нижче 12px
        (мобільний UX-прохід, серпень 2026). Окремий grid-рядок тримає
        текст на стабільному CSS-розмірі незалежно від масштабу чарта.
      */}
      <svg
        viewBox="0 0 620 150"
        fill="none"
        role="img"
        aria-label="Шість тижнів: що більше тренувань, то менше замовлень доставки"
        className="block w-full max-w-[620px]"
      >
        <line
          x1="20"
          y1={BASE_Y}
          x2="600"
          y2={BASE_Y}
          className="stroke-cardline-strong"
          strokeWidth="1"
        />
        {WEEKS.map((week, i) => {
          const barX = 34 + i * STEP_X;
          const barH = week.workouts * 18;
          return (
            <g key={i}>
              {barH > 0 && (
                <rect
                  x={barX}
                  y={BASE_Y - barH}
                  width={BAR_W}
                  height={barH}
                  className="fill-fizruk"
                />
              )}
              {Array.from({ length: week.deliveries }, (_, k) => (
                <circle
                  key={k}
                  cx={barX + 34}
                  cy={BASE_Y - 8 - k * 12}
                  r="4"
                  className="fill-finyk"
                />
              ))}
            </g>
          );
        })}
      </svg>
      <div
        aria-hidden="true"
        className="grid w-full max-w-[620px] grid-cols-6 text-xs text-subtle"
      >
        {WEEKS.map((_, i) => (
          <span key={i} className="text-center">
            Т{i + 1}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-5 text-xs text-subtle">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 bg-fizruk" />
          тренування
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-finyk" />
          замовлення доставки
        </span>
      </div>
    </div>
  );
}
