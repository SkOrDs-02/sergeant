import { chartHex } from "@sergeant/design-tokens/tokens";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { cn } from "@shared/lib/ui/cn";

export function MacroRatioBar({ prefs }: { prefs: NutritionPrefs }) {
  const prot = prefs.dailyTargetProtein_g ?? 0;
  const fat = prefs.dailyTargetFat_g ?? 0;
  const carb = prefs.dailyTargetCarbs_g ?? 0;
  if (!(prot > 0) && !(fat > 0) && !(carb > 0)) return null;

  const protKcal = prot * 4;
  const fatKcal = fat * 9;
  const carbKcal = carb * 4;
  const total = protKcal + fatKcal + carbKcal || 1;

  const pctP = Math.round((protKcal / total) * 100);
  const pctF = Math.round((fatKcal / total) * 100);
  const pctC = 100 - pctP - pctF;

  return (
    <div className="mt-3 space-y-1.5">
      <SectionHeading as="div" size="xs">
        Відсоткове співвідношення макро
      </SectionHeading>
      <div className="flex rounded-xl overflow-hidden h-5">
        {pctP > 0 && (
          <div
            className="flex items-center justify-center text-2xs font-bold text-white"
            style={{ width: `${pctP}%`, backgroundColor: chartHex.protein }}
          >
            {pctP}%
          </div>
        )}
        {pctF > 0 && (
          <div
            className="flex items-center justify-center text-2xs font-bold text-white"
            style={{ width: `${pctF}%`, backgroundColor: chartHex.fat }}
          >
            {pctF}%
          </div>
        )}
        {pctC > 0 && (
          <div
            className="flex items-center justify-center text-2xs font-bold text-white"
            style={{ width: `${pctC}%`, backgroundColor: chartHex.carbs }}
          >
            {pctC}%
          </div>
        )}
      </div>
      <div className="flex gap-3 flex-wrap">
        <span className="flex items-center gap-1 text-2xs text-subtle">
          <span
            className="w-2 h-2 rounded-sm"
            style={{ backgroundColor: chartHex.protein }}
          />{" "}
          Б {pctP}% · {prot}г · {Math.round(protKcal)} ккал
        </span>
        <span className="flex items-center gap-1 text-2xs text-subtle">
          <span
            className="w-2 h-2 rounded-sm"
            style={{ backgroundColor: chartHex.fat }}
          />{" "}
          Ж {pctF}% · {fat}г · {Math.round(fatKcal)} ккал
        </span>
        <span className="flex items-center gap-1 text-2xs text-subtle">
          <span
            className="w-2 h-2 rounded-sm"
            style={{ backgroundColor: chartHex.carbs }}
          />{" "}
          В {pctC}% · {carb}г · {Math.round(carbKcal)} ккал
        </span>
      </div>
    </div>
  );
}

interface MacroBadgeProps {
  label: string;
  value: number | null | undefined;
  unit?: string;
  color?: string;
}

export function MacroBadge({
  label,
  value,
  unit = "г",
  color = "bg-panelHi border border-line text-subtle",
}: MacroBadgeProps) {
  if (value == null) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs rounded-xl px-2 py-0.5",
        color || "bg-bg border border-line text-subtle",
      )}
    >
      <span className="font-semibold text-text">{Math.round(value)}</span>
      <span>{unit}</span>
      <span className="text-muted">{label}</span>
    </span>
  );
}
