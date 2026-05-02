const SIZE = 96;
const STROKE = 7;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface DayProgressRingProps {
  completed: number;
  scheduled: number;
  onClick?: () => void;
}

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
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            className="text-line/30"
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
            className="text-routine-strong dark:text-routine transition-colors duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-lg font-black text-text tabular-nums">
            {completed}/{scheduled}
          </span>
        </div>
      </div>
      <span className="text-2xs text-subtle font-medium group-hover:text-text transition-colors">
        Денний звіт
      </span>
    </button>
  );
}
