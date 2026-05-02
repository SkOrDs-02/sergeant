/* eslint-disable sergeant-design/no-eyebrow-drift */
import { StoryShell } from "./StoryShell";
import type { RoutineSlideData } from "../../types";
import type { HabitStat } from "../../../insights/useWeeklyDigest";

export function RoutineSlide({ slide }: { slide: RoutineSlideData }) {
  const { agg, ai } = slide;
  const sorted: HabitStat[] = Array.isArray(agg?.habits)
    ? [...agg.habits].sort(
        (a: HabitStat, b: HabitStat) => b.completionRate - a.completionRate,
      )
    : [];
  const top = sorted.slice(0, 3);

  return (
    <StoryShell slide={slide}>
      <p className="text-xs uppercase tracking-[0.3em] text-white/70 font-bold mb-2">
        Звички · Рутина
      </p>

      <div className="mb-6 flex items-center gap-4">
        <div className="relative w-[104px] h-[104px]">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle
              cx="18"
              cy="18"
              r="15.915"
              fill="none"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="3.5"
            />
            <circle
              cx="18"
              cy="18"
              r="15.915"
              fill="none"
              stroke="white"
              strokeWidth="3.5"
              strokeDasharray={`${Math.min(100, agg?.overallRate ?? 0)}, 100`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-3xl font-black leading-none tabular-nums">
              {agg?.overallRate ?? 0}%
            </div>
            <div className="text-2xs uppercase tracking-wider font-bold text-white/75 mt-0.5">
              виконано
            </div>
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-white/75 font-bold">
            Активних звичок
          </div>
          <div className="text-3xl font-black leading-tight tabular-nums">
            {agg?.habitCount ?? 0}
          </div>
        </div>
      </div>

      {top.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-xs uppercase tracking-wider text-white/75 font-bold">
            Топ-звички
          </p>
          {top.map((h) => (
            <div key={h.name} className="space-y-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold text-white/95 truncate pr-2">
                  {h.name}
                </span>
                <span className="tabular-nums font-bold">
                  {h.done}/{h.total}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
                <div
                  className="h-full bg-white rounded-full"
                  style={{ width: `${h.completionRate}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {ai?.summary && (
        <div className="mt-auto rounded-2xl bg-white/15 backdrop-blur-sm px-4 py-3 border border-white/20">
          <p className="text-style-label leading-snug">{ai.summary}</p>
          {ai.comment && (
            <p className="text-xs text-white/85 mt-2 leading-relaxed">
              {ai.comment}
            </p>
          )}
        </div>
      )}
    </StoryShell>
  );
}
