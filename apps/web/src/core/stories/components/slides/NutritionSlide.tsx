/* eslint-disable sergeant-design/no-eyebrow-drift */
import { StoryShell } from "./StoryShell";
import { fmtNum } from "../../formatters";
import type { NutritionSlideData } from "../../types";

export function NutritionSlide({ slide }: { slide: NutritionSlideData }) {
  const { agg, ai } = slide;
  const kcalPct =
    agg?.targetKcal && agg.targetKcal > 0
      ? Math.min(
          140,
          Math.max(0, Math.round((agg.avgKcal / agg.targetKcal) * 100)),
        )
      : 0;

  return (
    <StoryShell slide={slide}>
      <p className="text-xs uppercase tracking-[0.3em] text-white/70 font-bold mb-2">
        Харчування
      </p>

      <div className="mb-5">
        <div className="text-xs text-white/75 font-semibold">
          Середнє калорій/день
        </div>
        <div className="flex items-baseline gap-3 mt-1">
          <div className="text-display-hero leading-none font-black tabular-nums">
            {fmtNum(agg?.avgKcal)}
          </div>
          <div className="text-style-label text-white/80">
            / {fmtNum(agg?.targetKcal)}
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-white/15 overflow-hidden">
          <div
            className="h-full bg-white rounded-full"
            style={{ width: `${Math.min(100, kcalPct)}%` }}
          />
        </div>
        <div className="text-xs text-white/75 mt-1">
          {kcalPct}% від цілі · залоговано {agg?.daysLogged ?? 0} / 7 днів
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl bg-white/15 border border-white/20 px-3 py-2 text-center">
          <div className="text-2xs uppercase tracking-wider text-white/75 font-bold">
            Білки
          </div>
          <div className="text-xl font-black tabular-nums mt-0.5">
            {fmtNum(agg?.avgProtein)}г
          </div>
        </div>
        <div className="rounded-xl bg-white/15 border border-white/20 px-3 py-2 text-center">
          <div className="text-2xs uppercase tracking-wider text-white/75 font-bold">
            Жири
          </div>
          <div className="text-xl font-black tabular-nums mt-0.5">
            {fmtNum(agg?.avgFat)}г
          </div>
        </div>
        <div className="rounded-xl bg-white/15 border border-white/20 px-3 py-2 text-center">
          <div className="text-2xs uppercase tracking-wider text-white/75 font-bold">
            Вугл.
          </div>
          <div className="text-xl font-black tabular-nums mt-0.5">
            {fmtNum(agg?.avgCarbs)}г
          </div>
        </div>
      </div>

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
