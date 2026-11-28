/**
 * Last validated: 2026-05-14
 * Status: Active
 */
/* eslint-disable sergeant-design/no-cyrillic-jsx-literal -- pre-existing i18n tech debt; strings moved from LogCard.tsx during T3 decomposition */
import { formatUaShortWeekdayDate } from "@shared/lib/time/uaWeekdayDate";
import { MorphChevron } from "@shared/components/ui/MorphChevron";
import { useMemo, useState } from "react";
import { messages } from "@shared/i18n/uk";
import { addDaysISODate, getMacrosForDateRange } from "../lib/nutritionStorage";
import {
  deviceWeekStartKey,
  type NutritionLog,
} from "@sergeant/nutrition-domain";

/** Сталий id керованого регіону для `aria-controls` тогла. */
const WEEK_TABLE_ID = "nutrition-week-log-table";

/** «Пн, 17 лист.»: день тижня й дата людською мовою, а не `11-17`. */
function formatDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return formatUaShortWeekdayDate(date);
}

interface LogCardWeeklyTableProps {
  log: NutritionLog;
  selectedDate: string;
}

export function LogCardWeeklyTable({
  log,
  selectedDate,
}: LogCardWeeklyTableProps) {
  const [weekOpen, setWeekOpen] = useState(false);

  // Календарний тиждень Пн-Нд обраного дня, а не ковзні 7 днів до нього:
  // так само рахують огляд Їжі і звіти хаба (канон: тиждень з понеділка,
  // ISO 8601; FULL-20261126-UX-1). `getMacrosForDateRange` ставить найстарший
  // першим, тож кінець у неділю дає Пн…Нд.
  const weekRows = useMemo(() => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const anchor = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
    const weekEnd = addDaysISODate(deviceWeekStartKey(anchor), 6);
    return getMacrosForDateRange(log, weekEnd, 7);
  }, [log, selectedDate]);

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
        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg text-left fab-clear-row focus-ring"
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
                  <td className="py-1.5 pr-2">{formatDayLabel(r.date)}</td>
                  {r.kcal <= 0 ? (
                    // Порожній день це неповні дані, а не нульове
                    // споживання (канон §5.2).
                    <td colSpan={4} className="py-1 text-subtle">
                      {messages.nutrition.weekKcal.emptyDay}
                    </td>
                  ) : (
                    <>
                      <td className="py-1 pr-2">{Math.round(r.kcal)}</td>
                      <td className="py-1 pr-2">{Math.round(r.protein_g)}</td>
                      <td className="py-1 pr-2">{Math.round(r.fat_g)}</td>
                      <td className="py-1">{Math.round(r.carbs_g)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
