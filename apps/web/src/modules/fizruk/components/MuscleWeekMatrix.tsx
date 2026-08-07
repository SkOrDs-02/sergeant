/**
 * Last validated: 2026-08-07
 * Status: Active
 *
 * Матриця «мʼяз × тиждень» — signature-view Фізрука (П4). Обчислення й
 * повне обґрунтування діагнозу — у `../lib/muscleWeekMatrix.ts`.
 *
 * AI-CONTEXT: чому чотири стовпчики, а не одна смуга. Смуга відповідала на
 * «скільки в цій групі зараз» і мовчала про те, чи це тримається. Питання
 * Фізрука інше: обʼєм має сенс лише у порівнянні з собою тиждень тому.
 * Тому вісь часу — і та сама граматика, що в гребені Фініка (стовпчики на
 * осі часу), а не нова форма на кожен модуль.
 */
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import {
  MATRIX_WEEKS,
  MIN_WEEKS_WITH_DATA,
  type MuscleWeekMatrix,
} from "../lib/muscleWeekMatrix";

/**
 * Мінімальна видима висота НЕНУЛЬОВОГО стовпчика.
 *
 * AI-DANGER: підлога застосовується лише коли значення > 0. Дати її нулю
 * означало б намалювати тиждень відпочинку так само, як тиждень із
 * крихітним обʼємом, — тобто стерти рівно ту різницю, яку матриця й
 * показує (див. `ABSENCE_MEANS` у `dailySeries.ts`: не потренувався — це
 * нуль, а не «не виміряно»).
 */
const MIN_BAR_HEIGHT_PCT = 8;

/** Те саме для запасного однотижневого виду — успадковано з `Progress.tsx`. */
const MIN_BAR_WIDTH_PCT = 6;

function fillVars(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m,
  );
}

export interface MuscleVolumeBlockProps {
  matrix: MuscleWeekMatrix;
}

/**
 * Запасний вид: один тиждень — це не тренд.
 *
 * Поріг мовчання (`MIN_WEEKS_WITH_DATA`) тримає той самий контракт, що
 * `MIN_ENTRIES = 4` у гребені Фініка: доки виду нема чого сказати, він не
 * зʼявляється. Матриця з одним заповненим стовпчиком і трьома порожніми не
 * показує динаміки — вона лише голосно повідомляє, що даних мало.
 */
function LatestWeekBars({ matrix }: MuscleVolumeBlockProps) {
  const rows = [...matrix.rows].sort((a, b) => b.latest - a.latest);
  const max = rows[0]?.latest || 1;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-style-label text-text truncate">
              {row.label}
            </div>
            <div className="text-style-caption text-subtle tabular-nums">
              {row.latest.toFixed(1)}
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full border border-line bg-bg">
            <div
              className="h-full bg-success/70"
              style={{
                width: `${Math.max(MIN_BAR_WIDTH_PCT, (row.latest / max) * 100)}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function WeekMatrix({ matrix }: MuscleVolumeBlockProps) {
  const copy = messages.fizruk.progress;
  const lastIndex = MATRIX_WEEKS - 1;

  return (
    <div className="space-y-2" role="group" aria-label={copy.muscleVolumeAria}>
      {matrix.rows.map((row) => {
        const spoken = fillVars(copy.muscleVolumeRowSpoken, {
          label: row.label,
          values: row.weekly
            .map((v) => (v > 0 ? v.toFixed(1) : copy.muscleVolumeRestWeek))
            .join(", "),
          latest: row.latest.toFixed(1),
        });
        return (
          <div key={row.id} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-style-label text-text truncate">
                {row.label}
              </div>
              <div className="text-style-caption text-subtle tabular-nums">
                {row.latest.toFixed(1)}
              </div>
            </div>
            {/* Стовпчики сховані від скрінрідера — замість них іде речення
                нижче: чотири числа підряд без підпису тижня озвучувались би
                як набір, а не як динаміка. */}
            <div className="flex h-6 items-end gap-1" aria-hidden="true">
              {row.weekly.map((value, i) => (
                <div
                  key={matrix.weekStarts[i] ?? i}
                  className="flex h-full flex-1 items-end overflow-hidden rounded-sm border border-line bg-bg"
                >
                  <div
                    className={cn(
                      "w-full",
                      i === lastIndex ? "bg-success" : "bg-success/45",
                    )}
                    style={{
                      height:
                        value > 0
                          ? `${Math.max(MIN_BAR_HEIGHT_PCT, (value / matrix.max) * 100)}%`
                          : "0%",
                    }}
                  />
                </div>
              ))}
            </div>
            <span className="sr-only">{spoken}</span>
          </div>
        );
      })}
      <p className="text-style-caption text-subtle">
        {copy.muscleVolumeWindowHint}
      </p>
    </div>
  );
}

export function MuscleVolumeBlock({ matrix }: MuscleVolumeBlockProps) {
  if (matrix.weeksWithData < MIN_WEEKS_WITH_DATA) {
    return <LatestWeekBars matrix={matrix} />;
  }
  return <WeekMatrix matrix={matrix} />;
}
