import { useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { ProposalCard } from "./_PhoneFrame";
import { ComparePair, MiniPhone } from "./_Compare";

/**
 * R2-UI-16 — Two-handle range slider.
 *
 * Зараз: filtering by amount/calories uses a single-value Slider — you can
 * set a min OR a max, never both, so bracketing a band takes two passes.
 * Може бути: a dual-thumb range brackets a band ("₴ 200 – ₴ 900") in one
 * control. Handles are large touch targets and can't cross; the track
 * between them fills with the accent.
 *
 * Mock only — drag either handle on the right.
 */

const MIN = 0;
const MAX = 2000;
const STEP = 50;

export function DualRangeSliderDemo() {
  const [lo, setLo] = useState(200);
  const [hi, setHi] = useState(900);
  const [single, setSingle] = useState(900);
  const trackRef = useRef<HTMLDivElement>(null);
  const singleRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"lo" | "hi" | null>(null);
  const draggingSingle = useRef(false);

  function valueFrom(el: HTMLDivElement | null, clientX: number) {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round((MIN + ratio * (MAX - MIN)) / STEP) * STEP;
  }

  const loPct = ((lo - MIN) / (MAX - MIN)) * 100;
  const hiPct = ((hi - MIN) / (MAX - MIN)) * 100;
  const singlePct = ((single - MIN) / (MAX - MIN)) * 100;

  return (
    <ProposalCard
      id="R2-UI-16"
      title="Range-slider з двома ручками"
      intent="Зараз одиночний слайдер задає лише мін або макс; у пропозиції — діапазон одним контролом. Тягни ручки праворуч."
    >
      <ComparePair
        before={
          <MiniPhone dim>
            <div className="flex-1 min-h-0 flex flex-col justify-center px-5">
              <div className="mb-6">
                <p className="text-2xs text-muted">максимум</p>
                <p className="text-style-label tabular-nums text-text">до ₴ {single}</p>
              </div>
              <div
                ref={singleRef}
                className="relative h-11 flex items-center touch-none"
                onPointerMove={(e) => {
                  if (!draggingSingle.current) return;
                  const v = valueFrom(singleRef.current, e.clientX);
                  if (v != null) setSingle(v);
                }}
                onPointerUp={() => { draggingSingle.current = false; }}
              >
                <div className="absolute inset-x-0 h-1.5 rounded-full bg-surface-muted" />
                <div className="absolute h-1.5 rounded-full bg-accent" style={{ left: 0, right: `${100 - singlePct}%` }} />
                <button
                  type="button"
                  aria-label="Максимум"
                  onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); draggingSingle.current = true; }}
                  className="absolute h-7 w-7 -ml-3.5 rounded-full bg-panelHi border-2 border-accent shadow-card touch-none"
                  style={{ left: `${singlePct}%` }}
                />
              </div>
              <p className="text-2xs text-muted text-center mt-6">Лише верхня межа — нижню не задати</p>
            </div>
          </MiniPhone>
        }
        after={
          <MiniPhone>
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
                onPointerMove={(e) => {
                  if (!dragging.current) return;
                  const v = valueFrom(trackRef.current, e.clientX);
                  if (v == null) return;
                  if (dragging.current === "lo") setLo(Math.min(v, hi - STEP));
                  else setHi(Math.max(v, lo + STEP));
                }}
                onPointerUp={() => { dragging.current = null; }}
              >
                <div className="absolute inset-x-0 h-1.5 rounded-full bg-surface-muted" />
                <div className="absolute h-1.5 rounded-full bg-accent" style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }} />
                {([["lo", loPct], ["hi", hiPct]] as const).map(([which, pct]) => (
                  <button
                    key={which}
                    type="button"
                    aria-label={which === "lo" ? "Мінімум" : "Максимум"}
                    onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); dragging.current = which; }}
                    className="absolute h-7 w-7 -ml-3.5 rounded-full bg-panelHi border-2 border-accent shadow-card touch-none"
                    style={{ left: `${pct}%` }}
                  />
                ))}
              </div>

              <p className="text-2xs text-muted text-center mt-6">Діапазон ₴ {lo} – ₴ {hi} одним жестом</p>
            </div>
          </MiniPhone>
        }
      />
    </ProposalCard>
  );
}
