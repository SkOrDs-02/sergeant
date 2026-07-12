/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { useWaterTracker } from "../hooks/useWaterTracker";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";

const QUICK_ML = [200, 300, 500, 750];

function fmt(ml: number) {
  return ml >= 1000 ? `${(ml / 1000).toFixed(1)} л` : `${ml} мл`;
}

// Round-3 UI audit T4: undo has to invert whatever the last mutation was —
// an add (subtract it back) or a reset (add the pre-reset total back) —
// so it never shows up with nothing left to undo, and never no-ops after
// a reset the way a bare "last added amount" number did.
type LastAction = { type: "add" | "reset"; amount: number } | null;

interface WaterTrackerCardProps {
  goalMl?: number;
}

export function WaterTrackerCard({ goalMl = 2000 }: WaterTrackerCardProps) {
  const { todayMl, add, subtract, reset } = useWaterTracker();
  const [resetPending, setResetPending] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  const [customMl, setCustomMl] = useState("");
  const [lastAction, setLastAction] = useState<LastAction>(null);

  const handleAdd = (ml: number) => {
    const n = Number(ml);
    if (!Number.isFinite(n) || n <= 0) return;
    const clamped = Math.min(Math.floor(n), 5000);
    add(clamped);
    setLastAction({ type: "add", amount: clamped });
  };

  const handleUndo = () => {
    if (!lastAction) return;
    if (lastAction.type === "add") {
      subtract(lastAction.amount);
    } else {
      add(lastAction.amount);
    }
    setLastAction(null);
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
            <div className="text-style-label text-text leading-none">Вода</div>
            <div className="text-xs text-subtle mt-0.5">
              {fmt(todayMl)}
              {goalMl > 0 && ` / ${fmt(goalMl)}`}
              {done && <span aria-hidden="true"> ✓</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {goalMl > 0 && (
        <div className="h-2 bg-line/30 rounded-full overflow-hidden mb-3">
          <div
            className={cn(
              "h-full rounded-full transition-[width,background-color] duration-500",
              done ? "bg-success" : "bg-info",
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
              "h-9 rounded-xl text-style-caption transition-colors",
              "bg-info-soft text-info-strong dark:text-info border border-info/20",
              "hover:bg-info/20 active:scale-95",
            )}
          >
            +{ml < 1000 ? ml : `${ml / 1000}л`}
          </button>
        ))}
      </div>

      {/* Custom amount + undo. `flex-wrap` — if the row (input + 3 possible
          buttons) genuinely can't fit at 320px, it wraps to a second line
          instead of clipping (round-2 UI audit M5). */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {/* `Input`'s `className` prop lands on the inner `<input>`, not its
            own wrapping div — that wrapper is the actual flex item in this
            row, so it needs its own `flex-1 min-w-0` to be the thing that
            shrinks (round-2 UI audit M5). */}
        <div className="flex-1 min-w-0">
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
            className="h-11 w-full"
            aria-label="Свій об'єм у мл"
          />
        </div>
        <button
          type="button"
          onClick={handleCustomAdd}
          disabled={!customMl || Number(customMl) <= 0}
          className={cn(
            "h-11 px-3 rounded-xl text-style-caption transition-colors shrink-0 whitespace-nowrap",
            "bg-info-soft text-info-strong dark:text-info border border-info/20",
            "hover:bg-info/20 disabled:opacity-50 active:scale-95",
          )}
        >
          + Додати
        </button>
        {lastAction && (
          <button
            type="button"
            onClick={handleUndo}
            title={
              lastAction.type === "add"
                ? "Відмінити останнє додавання"
                : "Відмінити скидання"
            }
            className="h-11 px-3 rounded-xl text-style-caption text-subtle hover:text-text border border-line transition-colors shrink-0 whitespace-nowrap"
            aria-label={
              lastAction.type === "add"
                ? `Відмінити останнє додавання (${lastAction.amount} мл)`
                : `Відмінити скидання (повернути ${lastAction.amount} мл)`
            }
          >
            ↶ {lastAction.amount}
          </button>
        )}
        {todayMl > 0 && (
          <button
            type="button"
            title={
              resetPending ? "Підтвердити скидання" : "Скинути воду за сьогодні"
            }
            onClick={() => {
              if (resetPending) {
                if (resetTimerRef.current !== null) {
                  clearTimeout(resetTimerRef.current);
                  resetTimerRef.current = null;
                }
                const preResetMl = todayMl;
                reset();
                setResetPending(false);
                setLastAction(
                  preResetMl > 0 ? { type: "reset", amount: preResetMl } : null,
                );
              } else {
                // Скидаємо попередній таймер, якщо користувач натиснув двічі
                // поспіль — інакше перше повернення в idle зніматиме нове pending.
                if (resetTimerRef.current !== null) {
                  clearTimeout(resetTimerRef.current);
                }
                setResetPending(true);
                // 5s (was 2.5s) — round-2 UI audit M5: on a 320-375px
                // screen the confirm label ("Скинути?") is wider than the
                // idle icon, and 2.5s wasn't reliably enough time to
                // register the wider target and tap it.
                resetTimerRef.current = window.setTimeout(() => {
                  setResetPending(false);
                  resetTimerRef.current = null;
                }, 5000);
              }
            }}
            className={cn(
              "h-11 px-3 rounded-xl text-style-caption transition-colors border shrink-0 whitespace-nowrap",
              resetPending
                ? "text-danger border-danger/40"
                : "text-subtle hover:text-danger border-line",
            )}
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
    </Card>
  );
}
