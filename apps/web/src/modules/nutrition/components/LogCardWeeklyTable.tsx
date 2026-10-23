/**
 * Last validated: 2026-05-14
 * Status: Active
 */
/* eslint-disable sergeant-design/no-cyrillic-jsx-literal -- pre-existing i18n tech debt; strings moved from LogCard.tsx during T3 decomposition */
import { MorphChevron } from "@shared/components/ui/MorphChevron";
import { useMemo, useState } from "react";
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
    <div className="border-y border-line">
      <button
        type="button"
        onClick={() => setWeekOpen((v) => !v)}
        // Тогл керує таблицею нижче, але не повідомляв про це:
        // шеврон — єдиний натяк, і він декоративний (аудит 2026-09-16,
        // WF-13). `SectionHeading` типізований через `HTMLAttributes`
        // і розкладає `...props` на елемент, тож пропси доходять.
        aria-expanded={weekOpen}
        aria-controls={WEEK_TABLE_ID}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg text-left focus-ring"
      >
        <span className="text-style-body font-semibold text-text">
          Журнал за тиждень
        </span>
        <MorphChevron open={weekOpen} className="text-subtle" />
      </button>

      {weekOpen && (
        <div id={WEEK_TABLE_ID} className="overflow-x-auto pb-2">
          <table className="w-full text-style-label text-left tabular-nums">
            <thead>
              <tr className="text-style-caption font-semibold text-subtle">
                <th className="py-1 pr-2">Дата</th>
                <th className="py-1 pr-2">Ккал</th>
                <th className="py-1 pr-2">Б</th>
                <th className="py-1 pr-2">Ж</th>
                <th className="py-1">В</th>
              </tr>
            </thead>
            <tbody>
              {weekRows.map((r) => (
                <tr key={r.date} className="border-t border-line text-text">
                  <td className="py-1.5 pr-2">{r.date.slice(5)}</td>
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
