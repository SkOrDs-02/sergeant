/* eslint-disable sergeant-design/no-eyebrow-drift */
import { StoryShell } from "./StoryShell";
import { StatRow } from "./StatRow";
import { fmtNum } from "../../formatters";
import type { FizrukSlideData } from "../../types";

export function FizrukSlide({ slide }: { slide: FizrukSlideData }) {
  const { agg, ai } = slide;
  const topEx = Array.isArray(agg?.topExercises)
    ? agg.topExercises.slice(0, 3)
    : [];

  return (
    <StoryShell slide={slide}>
      <p className="text-xs uppercase tracking-[0.3em] text-white/70 font-bold mb-2">
        Тренування · ФІЗРУК
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-2xl bg-white/15 border border-white/20 px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-white/75 font-bold">
            Тренувань
          </div>
          <div className="text-4xl leading-none font-black tabular-nums mt-1">
            {agg?.workoutsCount ?? 0}
          </div>
        </div>
        <div className="rounded-2xl bg-white/15 border border-white/20 px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-white/75 font-bold">
            Обсяг, кг
          </div>
          <div className="text-4xl leading-none font-black tabular-nums mt-1">
            {fmtNum(agg?.totalVolume)}
          </div>
        </div>
      </div>

      {topEx.length > 0 && (
        <div className="mb-4">
          <p className="text-xs uppercase tracking-wider text-white/75 font-bold mb-2">
            Головні вправи
          </p>
          <div className="space-y-1">
            {topEx.map((e: { name: string; totalVolume: number }) => (
              <StatRow
                key={e.name}
                label={e.name}
                value={`${fmtNum(e.totalVolume)} кг`}
              />
            ))}
          </div>
        </div>
      )}

      {agg?.recoveryLabel && (
        <div className="mt-2 inline-flex self-start px-3 py-1.5 rounded-full bg-white/15 border border-white/20 text-xs font-semibold">
          {agg.recoveryLabel}
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
