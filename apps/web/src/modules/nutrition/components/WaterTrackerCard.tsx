import { useEffect, useRef, useState } from "react";
import { cn } from "@shared/lib/cn";
import { useWaterTracker } from "../hooks/useWaterTracker";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";

const QUICK_ML = [200, 300, 500, 750];

function fmt(ml: number) {
  return ml >= 1000 ? `${(ml / 1000).toFixed(1)} л` : `${ml} мл`;
}

interface WaterTrackerCardProps {
  goalMl?: number;
}

export function WaterTrackerCard({ goalMl = 2000 }: WaterTrackerCardProps) {
  const { todayMl, add, subtract, reset } = useWaterTracker();
  const [resetPending, setResetPending] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  const [customMl, setCustomMl] = useState("");
  const [lastAddedMl, setLastAddedMl] = useState(0);

  const handleAdd = (ml: number) => {
    const n = Number(ml);
    if (!Number.isFinite(n) || n <= 0) return;
    const clamped = Math.min(Math.floor(n), 5000);
    add(clamped);
    setLastAddedMl(clamped);
  };

  const handleUndo = () => {
    if (lastAddedMl <= 0) return;
    subtract(lastAddedMl);
    setLastAddedMl(0);
  };

  const handleCustomAdd = () => {
    const n = Number(customMl);
    if (!Number.isFinite(n) || n <= 0) return;
    handleAdd(n);
    setCustomMl("");
  };

  const pct = goalMl > 0 ? Math.min(100, (todayMl / goalMl) * 100) : 0;
  const done = todayMl >= goalMl && goalMl > 0;

  useEffect(() => {
    // Очищуємо pending-таймер при unmount, щоб не тригернути setState на
    // розмонтованому компоненті.
    return () => {
      if (resetTimerRef.current !== null) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, []);

  return (
    <Card radius="lg">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none" aria-hidden="true">
            💧
          </span>
          <div>
            <div className="text-sm font-semibold text-text leading-none">
              Вода
            </div>
            <div className="text-xs text-subtle mt-0.5">
              {fmt(todayMl)}
              {goalMl > 0 && ` / ${fmt(goalMl)}`}
              {done && <span aria-hidden="true"> ✓</span>}
            </div>
          </div>
        </div>
        {todayMl > 0 && (
          <button
            type="button"
            onClick={() => {
              if (resetPending) {
                if (resetTimerRef.current !== null) {
                  clearTimeout(resetTimerRef.current);
                  resetTimerRef.current = null;
                }
                reset();
                setResetPending(false);
              } else {
                // Скидаємо попередній таймер, якщо користувач натиснув двічі
                // поспіль — інакше перше повернення в idle зніматиме нове pending.
                if (resetTimerRef.current !== null) {
                  clearTimeout(resetTimerRef.current);
                }
                setResetPending(true);
                resetTimerRef.current = window.setTimeout(() => {
                  setResetPending(false);
                  resetTimerRef.current = null;
                }, 2500);
              }
            }}
            className="text-xs text-subtle hover:text-danger transition-colors px-2 py-1 rounded-lg"
            aria-label={
              resetPending
                ? "Підтвердити скидання води за сьогодні"
                : "Скинути воду за сьогодні"
            }
          >
            {resetPending ? "Скинути?" : <span aria-hidden="true">↺</span>}
          </button>
        )}
      </div>

      {/* Progress bar */}
      {goalMl > 0 && (
        <div className="h-2 bg-line/30 rounded-full overflow-hidden mb-3">
          <div
            className={cn(
              "h-full rounded-full transition-[width,background-color] duration-500",
              done ? "bg-success" : "bg-sky-500",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Quick-add buttons */}
      <div className="grid grid-cols-4 gap-1.5">
        {QUICK_ML.map((ml) => (
          <button
            key={ml}
            type="button"
            onClick={() => handleAdd(ml)}
            className={cn(
              "h-9 rounded-xl text-xs font-semibold transition-colors",
              "bg-info-soft text-info-strong dark:text-info border border-info/20",
              "hover:bg-info/20 active:scale-95",
            )}
          >
            +{ml < 1000 ? ml : `${ml / 1000}л`}
          </button>
        ))}
      </div>

      {/* Custom amount + undo */}
      <div className="mt-2 flex items-center gap-1.5">
        <Input
          value={customMl}
          onChange={(e) => setCustomMl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCustomAdd();
            }
          }}
          placeholder="мл"
          inputMode="numeric"
          className="h-9 flex-1"
          aria-label="Свій об'єм у мл"
        />
        <button
          type="button"
          onClick={handleCustomAdd}
          disabled={!customMl || Number(customMl) <= 0}
          className={cn(
            "h-9 px-3 rounded-xl text-xs font-semibold transition-colors",
            "bg-info-soft text-info-strong dark:text-info border border-info/20",
            "hover:bg-info/20 disabled:opacity-50 active:scale-95",
          )}
        >
          + Додати
        </button>
        {lastAddedMl > 0 && (
          <button
            type="button"
            onClick={handleUndo}
            className="h-9 px-3 rounded-xl text-xs font-semibold text-subtle hover:text-text border border-line transition-colors"
            aria-label={`Відмінити останнє додавання (${lastAddedMl} мл)`}
          >
            ↶ {lastAddedMl}
          </button>
        )}
      </div>
    </Card>
  );
}
