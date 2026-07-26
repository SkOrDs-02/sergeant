import { useState } from "react";
import { ComparePair, CompareTile } from "./_Compare";
import { cn } from "@shared/lib/ui/cn";

/**
 * V-18 — Smooth chart transitions on period change.
 *
 * Switching a report's period (week ↔ month) today swaps the dataset with a
 * fade/remount, so bars pop in from nothing. The proposal tweens each column
 * between the old and new value — the chart *morphs* instead of blinking,
 * which reads as continuous data rather than a reload.
 *
 * Mock only — toggle the period to compare remount-fade vs value-tween.
 */

const DATA = {
  week: [40, 65, 30, 80, 55, 70, 45],
  month: [70, 45, 85, 35, 60, 50, 90],
};

export function ChartTransitionDemo() {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [fadeKey, setFadeKey] = useState(0);
  const values = DATA[period];

  const toggle = () => {
    setPeriod((p) => (p === "week" ? "month" : "week"));
    setFadeKey((k) => k + 1);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <ComparePair
        before={
          <CompareTile dim className="justify-end">
            <div key={fadeKey} className="flex items-end gap-1.5 h-24 animate-[fade-in_260ms_ease]">
              {values.map((v, i) => (
                <span
                  key={i}
                  className="w-4 rounded-t-md bg-finyk"
                  style={{ height: `${v}%` }}
                />
              ))}
            </div>
            <p className="text-2xs text-muted">Ремаунт + fade — стовпці «блимають»</p>
          </CompareTile>
        }
        after={
          <CompareTile className="justify-end">
            <div className="flex items-end gap-1.5 h-24">
              {values.map((v, i) => (
                <span
                  key={i}
                  className="w-4 rounded-t-md bg-finyk transition-[height] duration-500 ease-out"
                  style={{ height: `${v}%` }}
                />
              ))}
            </div>
            <p className="text-2xs text-muted">Плавний tween висоти — дані «перетікають»</p>
          </CompareTile>
        }
      />
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "px-3 py-1.5 rounded-full text-style-caption font-medium",
          "bg-accent text-bg",
        )}
      >
        Період: {period === "week" ? "Тиждень" : "Місяць"} · перемкнути
      </button>
    </div>
  );
}
