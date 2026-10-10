/**
 * Last validated: 2026-10-10
 * Status: Active
 */
import { Measure } from "@shared/components/ui/Measure";
import {
  ATWATER_KCAL_PER_G,
  type NutritionPrefs,
} from "@sergeant/nutrition-domain";
import { SectionHeading } from "@shared/components/ui/SectionHeading";

// Мова H: співвідношення макро читається довжиною сегмента, а не кольором.
// Усі три в hue даних модуля, різна прозорість; легенда несе слова.
const SEGMENT_OPACITY = ["opacity-100", "opacity-60", "opacity-40"] as const;

export function MacroRatioBar({ prefs }: { prefs: NutritionPrefs }) {
  const prot = prefs.dailyTargetProtein_g ?? 0;
  const fat = prefs.dailyTargetFat_g ?? 0;
  const carb = prefs.dailyTargetCarbs_g ?? 0;
  if (!(prot > 0) && !(fat > 0) && !(carb > 0)) return null;

  const protKcal = prot * ATWATER_KCAL_PER_G.protein;
  const fatKcal = fat * ATWATER_KCAL_PER_G.fat;
  const carbKcal = carb * ATWATER_KCAL_PER_G.carbs;
  const total = protKcal + fatKcal + carbKcal || 1;

  const pctP = Math.round((protKcal / total) * 100);
  const pctF = Math.round((fatKcal / total) * 100);
  const pctC = 100 - pctP - pctF;

  const segments = [pctP, pctF, pctC];

  return (
    <div className="space-y-1.5">
      <SectionHeading as="div" size="xs">
        Відсоткове співвідношення макро
      </SectionHeading>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-[3px]">
        {segments.map(
          (pct, i) =>
            pct > 0 && (
              <div
                key={i}
                className={`bg-chart-nutrition ${SEGMENT_OPACITY[i]}`}
                style={{ width: `${pct}%` }}
              />
            ),
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <span className="flex items-center gap-1 text-style-caption text-muted">
          <span
            className={`h-2 w-2 rounded-[3px] bg-chart-nutrition ${SEGMENT_OPACITY[0]}`}
          />{" "}
          Б <Measure value={pctP} unit="%" /> ·{" "}
          <Measure value={prot} unit="г" /> ·{" "}
          <Measure value={Math.round(protKcal)} unit="ккал" />
        </span>
        <span className="flex items-center gap-1 text-style-caption text-muted">
          <span
            className={`h-2 w-2 rounded-[3px] bg-chart-nutrition ${SEGMENT_OPACITY[1]}`}
          />{" "}
          Ж <Measure value={pctF} unit="%" /> · <Measure value={fat} unit="г" />{" "}
          · <Measure value={Math.round(fatKcal)} unit="ккал" />
        </span>
        <span className="flex items-center gap-1 text-style-caption text-muted">
          <span
            className={`h-2 w-2 rounded-[3px] bg-chart-nutrition ${SEGMENT_OPACITY[2]}`}
          />{" "}
          В <Measure value={pctC} unit="%" /> ·{" "}
          <Measure value={carb} unit="г" /> ·{" "}
          <Measure value={Math.round(carbKcal)} unit="ккал" />
        </span>
      </div>
    </div>
  );
}
