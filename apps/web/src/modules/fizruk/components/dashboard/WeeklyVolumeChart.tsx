/**
 * WeeklyVolumeChart — міні-графік тижня (7 барів).
 *
 * Показує кількість тренувань або об'єм (кг) за кожен день тижня
 * (Пн–Нд, поточний тиждень). Чистий SVG без зовнішніх залежностей.
 */

import { useMemo } from "react";
import { Card } from "@shared/components/ui/Card";
import type { DashboardWorkoutInput } from "@sergeant/fizruk-domain/domain";

interface WeeklyVolumeChartProps {
  readonly workouts: readonly DashboardWorkoutInput[];
  readonly onOpenProgress: () => void;
}

const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

/** Monday-first local-day index 0..6 */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function localYmd(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mondayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - mondayIndex(d));
  return d;
}

export function WeeklyVolumeChart({
  workouts,
  onOpenProgress,
}: WeeklyVolumeChartProps) {
  const today = new Date();
  const todayIdx = mondayIndex(today);
  const weekStart = mondayOfWeek(today);

  // counts[0..6] = кількість тренувань за кожен день цього тижня
  const counts = useMemo<number[]>(() => {
    const arr = Array(7).fill(0);
    for (const w of workouts) {
      if (!w?.endedAt) continue;
      const ms = Date.parse(w.endedAt);
      if (!Number.isFinite(ms)) continue;
      const endedDate = new Date(ms);
      // check same week
      const wStart = mondayOfWeek(endedDate);
      if (localYmd(wStart.getTime()) !== localYmd(weekStart.getTime())) continue;
      const idx = mondayIndex(endedDate);
      arr[idx] = (arr[idx] || 0) + 1;
    }
    return arr;
  }, [workouts, weekStart]);

  const maxCount = Math.max(...counts, 1);
  const totalThisWeek = counts.reduce((s, v) => s + v, 0);

  const BAR_HEIGHT = 48;

  return (
    <button
      type="button"
      onClick={onOpenProgress}
      className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fizruk/50 rounded-2xl"
      aria-label={`Активність цього тижня: ${totalThisWeek} тренувань. Відкрити прогрес`}
    >
      <Card
        module="fizruk"
        prominence="default"
        padding="md"
        radius="xl"
        className="hover:bg-panelHi active:scale-[0.99] transition-[transform,background-color]"
      >
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-fizruk/10 shrink-0">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-fizruk"
                aria-hidden
              >
                <rect x="18" y="3" width="4" height="18" rx="1" />
                <rect x="10" y="8" width="4" height="13" rx="1" />
                <rect x="2" y="13" width="4" height="8" rx="1" />
              </svg>
            </span>
            <span className="text-style-label text-text">Активність тижня</span>
          </div>
          <span className="text-xs text-muted">
            {totalThisWeek > 0 ? `${totalThisWeek} трен.` : "Поки порожньо"}
          </span>
        </div>

        {/* Bar chart */}
        <div
          className="flex items-end gap-1.5 justify-between"
          style={{ height: BAR_HEIGHT + 20 }}
          aria-hidden
        >
          {counts.map((count, i) => {
            const isToday = i === todayIdx;
            const isFuture = i > todayIdx;
            const heightPct = count > 0 ? Math.max(0.15, count / maxCount) : 0;
            const barH = Math.round(heightPct * BAR_HEIGHT);

            return (
              <div
                key={DAY_LABELS[i]}
                className="flex flex-col items-center gap-1 flex-1"
              >
                <div
                  className="w-full rounded-t-md transition-all duration-500 relative"
                  style={{ height: BAR_HEIGHT }}
                >
                  {/* Empty track */}
                  <div className="absolute inset-0 rounded-md bg-panelHi" />
                  {/* Filled bar */}
                  {count > 0 && (
                    <div
                      className={[
                        "absolute bottom-0 left-0 right-0 rounded-md transition-all duration-500",
                        isToday ? "bg-fizruk" : "bg-fizruk/50",
                      ].join(" ")}
                      style={{ height: barH }}
                    />
                  )}
                </div>
                <span
                  className={[
                    "text-2xs",
                    isToday ? "text-fizruk font-semibold" : isFuture ? "text-muted/50" : "text-subtle",
                  ].join(" ")}
                >
                  {DAY_LABELS[i]}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </button>
  );
}
