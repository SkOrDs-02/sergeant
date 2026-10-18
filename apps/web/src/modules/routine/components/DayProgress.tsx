import { messages } from "@shared/i18n/uk";

export interface DayProgressProps {
  completed: number;
  scheduled: number;
  onClick?: () => void;
}

/** H: число й N сегментів, без фіксованого просвіту кільця чи ліміту звичок. */
export function DayProgress({
  completed,
  scheduled,
  onClick,
}: DayProgressProps) {
  const ratio = scheduled > 0 ? Math.min(1, completed / scheduled) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring flex min-h-11 w-full flex-col gap-3 text-left text-text"
      aria-label={
        scheduled > 0
          ? messages.routine.progressAria
              .replace("{done}", String(completed))
              .replace("{total}", String(scheduled))
          : messages.routine.dayProgressEmptyAria
      }
    >
      <span className="flex w-full flex-wrap items-baseline justify-between gap-2">
        <span className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
          <span className="text-style-display break-all">
            {scheduled > 0 ? completed : "–"}
          </span>
          {scheduled > 0 && (
            <span className="text-style-title break-all">
              {messages.routine.progressOf.replace(
                "{total}",
                String(scheduled),
              )}
            </span>
          )}
        </span>
        <span className="text-style-label text-muted">
          {messages.routine.dayReport}
        </span>
      </span>
      {scheduled > 0 && (
        <span
          aria-hidden="true"
          className="block h-[5px] w-full bg-line/50"
          style={{
            // CSS repeats keep the DOM constant even for six-digit counts.
            maskImage:
              "linear-gradient(to right, black calc(100% - min(3px, 20%)), transparent 0)",
            maskSize: `calc(100% / ${scheduled}) 100%`,
            maskRepeat: "repeat-x",
          }}
        >
          <span
            className="block h-full bg-chart-routine"
            style={{
              // End inside the segment gap: fractional CSS pixels must not
              // paint a sliver of the next uncompleted segment.
              width:
                ratio > 0 && ratio < 1
                  ? `calc(${ratio * 100}% - 1px)`
                  : `${ratio * 100}%`,
            }}
          />
        </span>
      )}
    </button>
  );
}
