/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { useWaterTracker, WATER_ADD_EVENT } from "../hooks/useWaterTracker";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import { Button } from "@shared/components/ui/Button";
import { Sheet } from "@shared/components/ui/Sheet";
import { WaterHistorySheet } from "./WaterHistorySheet";
import { messages } from "@shared/i18n/uk";
import { formatNumberUk } from "@sergeant/shared";

const QUICK_ML = [200, 300, 500, 750];

// Ціль задається з точністю до мілілітра, а поточний обʼєм складається з
// довільних доливів — фіксований один знак після коми брехав на обох
// (2350 мл читалось як «2.4 л»). Тримаємо до двох знаків і зрізаємо зайві
// нулі, щоб рівні значення лишались короткими: 2000 → «2 л», 2350 → «2,35 л».
export function fmt(ml: number) {
  if (ml < 1000) return `${ml} мл`;
  const litres = formatNumberUk(ml / 1000, {
    maximumFractionDigits: 2,
  });
  return `${litres} л`;
}

// Round-3 UI audit T4: undo has to invert whatever the last mutation was —
// an add (subtract it back) or a reset (add the pre-reset total back) —
// so it never shows up with nothing left to undo, and never no-ops after
// a reset the way a bare "last added amount" number did.
type LastAction = { type: "add"; amount: number } | null;

interface WaterTrackerCardProps {
  goalMl?: number;
}

export function WaterTrackerCard({ goalMl = 2000 }: WaterTrackerCardProps) {
  const { todayMl, log, add, subtract, reset } = useWaterTracker();
  const [resetPending, setResetPending] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  const [customMl, setCustomMl] = useState("");
  const [lastAction, setLastAction] = useState<LastAction>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const open = () => setAddOpen(true);
    window.addEventListener(WATER_ADD_EVENT, open);
    return () => window.removeEventListener(WATER_ADD_EVENT, open);
  }, []);

  const handleAdd = (ml: number) => {
    const n = Number(ml);
    if (!Number.isFinite(n) || n <= 0) return;
    const clamped = Math.min(Math.floor(n), 5000);
    add(clamped);
    setLastAction({ type: "add", amount: clamped });
  };

  const handleUndo = () => {
    if (!lastAction) return;
    subtract(lastAction.amount);
    setLastAction(null);
  };

  const handleCustomAdd = () => {
    const n = Number(customMl);
    if (!Number.isFinite(n) || n <= 0) return;
    handleAdd(n);
    setCustomMl("");
    setAddOpen(false);
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
    <Card as="section" padding="md">
      <SectionHeading
        size="lg"
        meta={
          <span className="tabular-nums">
            {fmt(todayMl)}
            {goalMl > 0 && ` / ${fmt(goalMl)}`}
          </span>
        }
        action={
          /* Вхід у журнал раніше був самим хедером-кнопкою без жодного
             візуального афордансу — його не знаходили. Тепер це названа
             кнопка. */
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="touch-target rounded-lg text-style-label font-semibold text-text focus-ring"
            aria-label={`${messages.nutrition.waterHistory.openLabel}: ${fmt(todayMl)}${goalMl > 0 ? ` / ${fmt(goalMl)}` : ""}`}
          >
            Історія
          </button>
        }
      >
        Вода
      </SectionHeading>

      <WaterHistorySheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        log={log}
        goalMl={goalMl}
      />

      {/* Progress bar */}
      {goalMl > 0 && (
        <div className="mt-2 mb-3 h-[5px] rounded-[3px] bg-line overflow-hidden">
          <div
            className={cn(
              "h-full rounded-[3px] transition-[width] duration-slower",
              done ? "bg-text" : "bg-chart-nutrition",
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
            className="h-9 rounded-[7px] border border-line text-style-label font-semibold text-text tabular-nums hover:bg-line/40 focus-ring"
          >
            +{ml < 1000 ? ml : `${ml / 1000}л`}
          </button>
        ))}
      </div>

      <Sheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={messages.nutrition.addSources.water.label}
        footer={
          <Button
            variant="solid"
            className="h-12 w-full"
            onClick={handleCustomAdd}
            disabled={!customMl || Number(customMl) <= 0}
          >
            {messages.nutrition.waterAdd.submit}
          </Button>
        }
      >
        <div className="p-4">
          <Input
            value={customMl}
            onChange={(e) => setCustomMl(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCustomAdd();
              }
            }}
            placeholder="мл"
            inputMode="numeric"
            aria-label="Свій обʼєм у мл"
          />
        </div>
      </Sheet>

      {/* Свій обʼєм живе в аркуші «Вода» (кут «Додати»), тут лишаються
          швидкі суми, «Відмінити» і скидання. `flex-wrap` - щоб ряд не
          обрізався на 320 px (round-2 UI audit M5). */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {lastAction && (
          <button
            type="button"
            onClick={handleUndo}
            title={"Відмінити останнє додавання"}
            className="h-11 px-3 inline-flex items-center rounded-lg text-style-label text-muted hover:text-text border border-border-strong shrink-0 whitespace-nowrap focus-ring"
            aria-label={`Відмінити останнє додавання (${lastAction.amount} мл)`}
          >
            Відмінити
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
                reset();
                setResetPending(false);
                setLastAction(null);
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
              "h-11 px-3 inline-flex items-center justify-center rounded-lg text-style-label border shrink-0 whitespace-nowrap focus-ring",
              resetPending
                ? "text-danger-strong border-danger/40"
                : "text-muted hover:text-danger-strong border-line",
            )}
            aria-label={
              resetPending
                ? "Підтвердити скидання води за сьогодні"
                : "Скинути воду за сьогодні"
            }
          >
            {resetPending ? "Скинути?" : <Icon name="refresh-cw" size="sm" />}
          </button>
        )}
      </div>
    </Card>
  );
}
