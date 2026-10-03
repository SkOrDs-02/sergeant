/**
 * Last validated: 2026-05-14
 * Status: Active
 */
/* eslint-disable sergeant-design/no-cyrillic-jsx-literal -- pre-existing i18n tech debt; strings moved from LogCard.tsx during T3 decomposition */
import { useMemo, useState } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { getMacrosForDateRange } from "../lib/nutritionStorage";
import type { NutritionLog } from "@sergeant/nutrition-domain";

/** Сталий id керованого регіону для `aria-controls` тогла. */
const WEEK_TABLE_ID = "nutrition-week-log-table";

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
    <div className="rounded-2xl border border-line bg-panel px-3 py-2">
      <SectionHeading
        as="button"
        size="xs"
        variant="nutrition"
        type="button"
        onClick={() => setWeekOpen((v) => !v)}
        // Тогл керує таблицею нижче, але не повідомляв про це:
        // шеврон — єдиний натяк, і він декоративний (аудит 2026-09-16,
        // WF-13). `SectionHeading` типізований через `HTMLAttributes`
        // і розкладає `...props` на елемент, тож пропси доходять.
        aria-expanded={weekOpen}
        aria-controls={WEEK_TABLE_ID}
        className="flex items-center gap-2 w-full text-left py-1"
      >
        <Icon
          name="chevron-right"
          size="xs"
          strokeWidth={2.5}
          className={cn(
            "transition-transform shrink-0",
            weekOpen ? "rotate-90" : "",
          )}
        />
        Журнал за тиждень
      </SectionHeading>

      {weekOpen && (
        <div id={WEEK_TABLE_ID} className="overflow-x-auto mt-2">
          <table className="w-full text-style-caption text-left">
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
                  <td className="py-1 pr-2 font-mono text-style-caption">
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
      )}
    </div>
  );
}
