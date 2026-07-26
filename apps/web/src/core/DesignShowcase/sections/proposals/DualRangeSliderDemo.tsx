import { useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { PhoneFrame, ProposalCard } from "./_PhoneFrame";

/**
 * R2-UI-16 — Two-handle range slider.
 *
 * Today filtering by amount/calories uses a single-value Slider (only a min
 * OR max). The proposal adds a dual-thumb range so the user brackets a band
 * ("₴ 200 – ₴ 900") in one control. Handles are 44px touch targets and can't
 * cross. Track between the thumbs is filled with the accent.
 *
 * Mock only — drag either handle.
 */

const MIN = 0;
const MAX = 2000;
const STEP = 50;

export function DualRangeSliderDemo() {
  const [lo, setLo] = useState(200);
  const [hi, setHi] = useState(900);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"lo" | "hi" | null>(null);

  function valueFromClientX(clientX: number) {
    const el = trackRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round((MIN + ratio * (MAX - MIN)) / STEP) * STEP;
  }

  function onPointerDown(which: "lo" | "hi") {
    return (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragging.current = which;
    };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const v = valueFromClientX(e.clientX);
    if (v == null) return;
    if (dragging.current === "lo") setLo(Math.min(v, hi - STEP));
    else setHi(Math.max(v, lo + STEP));
  }
  function onPointerUp() {
    dragging.current = null;
  }

  const loPct = ((lo - MIN) / (MAX - MIN)) * 100;
  const hiPct = ((hi - MIN) / (MAX - MIN)) * 100;

  return (
    <ProposalCard
      id="R2-UI-16"
      title="Range-slider з двома ручками"
      intent="Фільтр діапазону сум/калорій одним контролом замість лише мін або макс. Тягни будь-яку ручку."
    >
      <PhoneFrame>
        <div className="flex-1 min-h-0 flex flex-col justify-center px-5">
          <div className="flex items-baseline justify-between mb-6">
            <div>
              <p className="text-2xs text-muted">від</p>
              <p className="text-style-label tabular-nums text-text">₴ {lo}</p>
            </div>
            <div className="text-right">
              <p className="text-2xs text-muted">до</p>
              <p className="text-style-label tabular-nums text-text">₴ {hi}</p>
            </div>
          </div>

          <div
            ref={trackRef}
            className="relative h-11 flex items-center touch-none"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div className="absolute inset-x-0 h-1.5 rounded-full bg-surface-muted" />
            <div
              className="absolute h-1.5 rounded-full bg-accent"
              style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
            />
            {([["lo", loPct], ["hi", hiPct]] as const).map(([which, pct]) => (
              <button
                key={which}
                type="button"
                aria-label={which === "lo" ? "Мінімум" : "Максимум"}
                onPointerDown={onPointerDown(which)}
                className={cn(
                  "absolute h-7 w-7 -ml-3.5 rounded-full bg-panelHi border-2 border-accent shadow-card",
                  "touch-none",
                )}
                style={{ left: `${pct}%` }}
              />
            ))}
          </div>

          <p className="text-2xs text-muted text-center mt-6">
            Показано записи в діапазоні ₴ {lo} – ₴ {hi}
          </p>
        </div>
      </PhoneFrame>
    </ProposalCard>
  );
}
