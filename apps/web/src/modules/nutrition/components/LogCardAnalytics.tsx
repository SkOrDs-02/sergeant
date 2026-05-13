/* eslint-disable sergeant-design/no-cyrillic-jsx-literal -- pre-existing i18n tech debt; strings moved from LogCard.tsx during T3 decomposition */
import { useMemo, useState } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { cn } from "@shared/lib/ui/cn";
import {
  avgFromSummary,
  getRowsForRange,
  mealTypeBreakdown,
  summarizeRows,
  topMeals,
} from "../lib/nutritionStats";
import { MEAL_ORDER, MEAL_META } from "../lib/mealTypes";
import type { NutritionLog } from "@sergeant/nutrition-domain";

interface LogCardAnalyticsProps {
  log: NutritionLog;
  selectedDate: string;
}

export function LogCardAnalytics({ log, selectedDate }: LogCardAnalyticsProps) {
  const [statsRange, setStatsRange] = useState(30);

  const statsRows = useMemo(
    () => getRowsForRange(log, selectedDate, statsRange),
    [log, selectedDate, statsRange],
  );
  const statsSummary = useMemo(() => summarizeRows(statsRows), [statsRows]);
  const statsAvg = useMemo(() => avgFromSummary(statsSummary), [statsSummary]);
  const statsTop = useMemo(
    () => topMeals(log, selectedDate, statsRange, 8),
    [log, selectedDate, statsRange],
  );
  const statsMealTypes = useMemo(
    () => mealTypeBreakdown(log, selectedDate, statsRange),
    [log, selectedDate, statsRange],
  );

  return (
    <div className="rounded-2xl border border-line bg-panel/40 px-3 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading as="div" size="xs" variant="nutrition">
          Аналітика (тренди)
        </SectionHeading>
        <div className="flex gap-2">
          {[30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setStatsRange(d)}
              className={cn(
                "px-2 py-1 rounded-xl text-xs font-semibold border",
                statsRange === d
                  ? "border-nutrition/60 text-nutrition-strong dark:text-nutrition bg-nutrition/10"
                  : "border-line text-subtle bg-panelHi",
              )}
            >
              {d} днів
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { key: "kcal", label: "Сер. ккал/день", v: statsAvg.kcal },
          { key: "protein_g", label: "Сер. Б/день", v: statsAvg.protein_g },
          { key: "fat_g", label: "Сер. Ж/день", v: statsAvg.fat_g },
          { key: "carbs_g", label: "Сер. В/день", v: statsAvg.carbs_g },
        ].map((x) => (
          <div key={x.key} className="bg-panelHi rounded-2xl px-2 py-3">
            <div className="text-2xs text-subtle">{x.label}</div>
            <div className="text-base font-extrabold text-text tabular-nums">
              {Math.round(Number(x.v) || 0)}
            </div>
            <div className="text-2xs text-subtle">
              на {statsAvg.denom} активн. днів
            </div>
          </div>
        ))}
      </div>

      <div className="bg-panelHi rounded-2xl px-3 py-3">
        <SectionHeading as="div" size="xs" variant="nutrition" className="mb-2">
          Калорії по днях (останні {Math.min(statsRange, statsRows.length)})
        </SectionHeading>
        {statsRows.length === 0 ? (
          // eslint-disable-next-line sergeant-design/no-bare-empty-text -- pre-existing tech debt; tracked in docs/tech-debt/frontend.md
          <div className="text-xs text-muted">Поки що порожньо</div>
        ) : (
          (() => {
            const kcals = statsRows.map((r) => Number(r.kcal) || 0);
            const max = Math.max(1, ...kcals);
            return (
              <div className="flex items-end gap-0.5 h-12">
                {kcals.slice(-statsRange).map((k, i) => (
                  <div
                    key={i}
                    title={`${Math.round(k)} ккал`}
                    className="flex-1 rounded-sm bg-nutrition/60"
                    style={{
                      height: `${Math.max(2, Math.round((k / max) * 48))}px`,
                    }}
                  />
                ))}
              </div>
            );
          })()
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="bg-panelHi rounded-2xl px-3 py-3">
          <SectionHeading
            as="div"
            size="xs"
            variant="nutrition"
            className="mb-2"
          >
            Топ страв
          </SectionHeading>
          {statsTop.length === 0 ? (
            // eslint-disable-next-line sergeant-design/no-bare-empty-text -- pre-existing tech debt; tracked in docs/tech-debt/frontend.md
            <div className="text-xs text-muted">Поки що порожньо</div>
          ) : (
            <ol className="space-y-1">
              {statsTop.map((x) => (
                <li
                  key={x.name}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span className="text-xs text-text truncate">{x.name}</span>
                  <span className="text-xs text-subtle shrink-0">
                    {x.count}× · {Math.round(x.kcal)} ккал
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="bg-panelHi rounded-2xl px-3 py-3">
          <SectionHeading
            as="div"
            size="xs"
            variant="nutrition"
            className="mb-2"
          >
            Розподіл прийомів
          </SectionHeading>
          {Object.keys(statsMealTypes).length === 0 ? (
            // eslint-disable-next-line sergeant-design/no-bare-empty-text -- pre-existing tech debt; tracked in docs/tech-debt/frontend.md
            <div className="text-xs text-muted">Поки що порожньо</div>
          ) : (
            <ul className="space-y-1">
              {MEAL_ORDER.filter(
                (t) => (statsMealTypes[t]?.count ?? 0) > 0,
              ).map((t) => (
                <li
                  key={t}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span className="text-xs text-text">
                    {MEAL_META[t]?.emoji} {MEAL_META[t]?.label || t}
                  </span>
                  <span className="text-xs text-subtle shrink-0">
                    {statsMealTypes[t]!.count}× ·{" "}
                    {Math.round(statsMealTypes[t]!.kcal)} ккал
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
