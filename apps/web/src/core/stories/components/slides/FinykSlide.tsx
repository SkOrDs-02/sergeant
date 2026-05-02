/* eslint-disable sergeant-design/no-eyebrow-drift */
import { StoryShell } from "./StoryShell";
import { StatRow } from "./StatRow";
import { fmtUah } from "../../formatters";
import type { FinykSlideData } from "../../types";

export function FinykSlide({ slide }: { slide: FinykSlideData }) {
  const { agg, ai } = slide;
  const net = (agg?.totalIncome ?? 0) - (agg?.totalSpent ?? 0);
  const topCats = Array.isArray(agg?.topCategories)
    ? agg.topCategories.slice(0, 3)
    : [];
  const maxCat = topCats[0]?.amount || 1;

  return (
    <StoryShell slide={slide}>
      <p className="text-xs uppercase tracking-[0.3em] text-white/70 font-bold mb-2">
        Фінанси · ФІНІК
      </p>
      <div className="mb-6">
        <div className="text-xs text-white/70 font-semibold">Витрати тижня</div>
        <div className="text-display-hero leading-none font-black tabular-nums mt-1">
          {fmtUah(agg?.totalSpent)}
        </div>
        <div className="mt-2 text-sm text-white/80">
          {agg?.txCount || 0} транзакцій · дохід {fmtUah(agg?.totalIncome)}
        </div>
      </div>

      {topCats.length > 0 && (
        <div className="mb-6 space-y-2">
          <p className="text-xs uppercase tracking-wider text-white/75 font-bold">
            Куди пішли гроші
          </p>
          {topCats.map((c: { name: string; amount: number }) => {
            const pct = Math.max(6, Math.round((c.amount / maxCat) * 100));
            return (
              <div key={c.name} className="space-y-1">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold text-white/95 truncate pr-2">
                    {c.name}
                  </span>
                  <span className="tabular-nums font-bold">
                    {fmtUah(c.amount)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mb-4">
        <StatRow
          label="Чистий потік"
          value={`${net >= 0 ? "+" : "−"}${fmtUah(Math.abs(net))}`}
          accent
        />
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
