import { useEffect, useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { ProposalCard } from "./_PhoneFrame";
import { ComparePair, MiniPhone } from "./_Compare";

/**
 * R2-UI-18 — Inline value-picker wheel (iOS-style).
 *
 * Зараз: quantities are typed into a numeric field that pops the OS numpad,
 * covering half the screen for a value that's usually one of a few presets.
 * Може бути: a scroll-snap wheel keeps everything on-screen — the centre row
 * is the selected value, neighbours dim with distance, snap points settle it.
 *
 * Mock only — scroll the wheel on the right; the centred value is selected.
 */

const VALUES = Array.from({ length: 21 }, (_, i) => i * 25); // 0..500 g
const ITEM_H = 40;

export function WheelPickerDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(6); // 150 g

  useEffect(() => {
    ref.current?.scrollTo({ top: index * ITEM_H });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / ITEM_H);
    if (i !== index) setIndex(i);
  }

  return (
    <ProposalCard
      id="R2-UI-18"
      title="Колесо вибору значення (iOS-style)"
      intent="Зараз ввід порції відкриває системний numpad на пів екрана; у пропозиції — колесо просто на місці. Крути колесо праворуч."
    >
      <ComparePair
        before={
          <MiniPhone dim>
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 flex flex-col items-center justify-start pt-6 gap-4">
                <p className="text-style-caption text-muted">Порція</p>
                <div className="w-40 h-12 rounded-xl border border-accent/50 bg-panel flex items-center px-3">
                  <span className="text-xl tabular-nums text-text">150</span>
                  <span className="ml-1 text-muted text-style-caption">г</span>
                  <span className="ml-auto h-5 w-px bg-accent animate-pulse" />
                </div>
              </div>
              {/* fake OS numpad covering lower half */}
              <div className="mt-auto grid grid-cols-3 gap-px bg-line border-t border-line">
                {[
                  "1",
                  "2",
                  "3",
                  "4",
                  "5",
                  "6",
                  "7",
                  "8",
                  "9",
                  ".",
                  "0",
                  "⌫",
                ].map((k) => (
                  <div
                    key={k}
                    className="h-9 bg-panelHi flex items-center justify-center text-style-caption text-text"
                  >
                    {k}
                  </div>
                ))}
              </div>
            </div>
          </MiniPhone>
        }
        after={
          <MiniPhone>
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4">
              <p className="text-style-caption text-muted">Порція</p>
              <div className="relative h-[200px] w-40">
                <div
                  className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 border-y border-accent/40 bg-accent/5"
                  style={{ height: ITEM_H }}
                />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-16 z-10 bg-gradient-to-b from-bg to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 z-10 bg-gradient-to-t from-bg to-transparent" />
                <div
                  ref={ref}
                  onScroll={onScroll}
                  className="h-full overflow-y-auto no-scrollbar snap-y snap-mandatory"
                  style={{ scrollPaddingTop: 80 }}
                >
                  <div style={{ height: 80 }} />
                  {VALUES.map((v, i) => {
                    const dist = Math.abs(i - index);
                    return (
                      <div
                        key={v}
                        className={cn(
                          "snap-center flex items-center justify-center tabular-nums transition-all",
                          dist === 0
                            ? "text-text text-xl font-semibold"
                            : "text-muted",
                        )}
                        style={{
                          height: ITEM_H,
                          opacity:
                            dist === 0 ? 1 : Math.max(0.25, 1 - dist * 0.28),
                        }}
                      >
                        {v} г
                      </div>
                    );
                  })}
                  <div style={{ height: 80 }} />
                </div>
              </div>
              <p className="text-2xs text-muted">
                Обрано: {VALUES[index]} г · без numpad
              </p>
            </div>
          </MiniPhone>
        }
      />
    </ProposalCard>
  );
}
