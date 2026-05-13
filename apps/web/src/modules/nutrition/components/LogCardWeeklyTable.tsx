/* eslint-disable sergeant-design/no-cyrillic-jsx-literal -- pre-existing i18n tech debt; strings moved from LogCard.tsx during T3 decomposition */
import { useMemo, useState } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { getMacrosForDateRange } from "../lib/nutritionStorage";
import type { NutritionLog } from "@sergeant/nutrition-domain";

interface LogCardWeeklyTableProps {
  log: NutritionLog;
  selectedDate: string;
}

export function LogCardWeeklyTable({
  log,
  selectedDate,
}: LogCardWeeklyTableProps) {
  const [weekOpen, setWeekOpen] = useState(false);

  const weekRows = useMemo(
    () => getMacrosForDateRange(log, selectedDate, 7),
    [log, selectedDate],
  );

  return (
    <>
      <SectionHeading
        as="button"
        size="xs"
        type="button"
        onClick={() => setWeekOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left py-1"
      >
        <Icon
          name="chevron-right"
          size={12}
          strokeWidth={2.5}
          className={cn(
            "transition-transform shrink-0",
            weekOpen ? "rotate-90" : "",
          )}
        />
        Журнал за тиждень
      </SectionHeading>

      {weekOpen && (
        <div className="rounded-2xl border border-line bg-panel/40 px-3 py-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-subtle">
                  <th className="py-1 pr-2">Дата</th>
                  <th className="py-1 pr-2">Ккал</th>
                  <th className="py-1 pr-2">Б</th>
                  <th className="py-1 pr-2">Ж</th>
                  <th className="py-1">В</th>
                </tr>
              </thead>
              <tbody>
                {weekRows.map((r) => (
                  <tr key={r.date} className="border-t border-line/40">
                    <td className="py-1 pr-2 font-mono text-2xs">
                      {r.date.slice(5)}
                    </td>
                    <td className="py-1 pr-2">{Math.round(r.kcal)}</td>
                    <td className="py-1 pr-2">{Math.round(r.protein_g)}</td>
                    <td className="py-1 pr-2">{Math.round(r.fat_g)}</td>
                    <td className="py-1">{Math.round(r.carbs_g)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
