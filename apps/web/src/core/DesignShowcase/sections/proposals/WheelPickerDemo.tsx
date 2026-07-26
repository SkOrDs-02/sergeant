import { useEffect, useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { PhoneFrame, ProposalCard } from "./_PhoneFrame";

/**
 * R2-UI-18 — Inline value-picker wheel (iOS-style).
 *
 * For quantities where discrete values dominate (portions, weight in 0.5kg
 * steps, reps) a scroll-snap wheel is faster than typing and avoids opening
 * the OS numpad. The centre row is the selected value; neighbours dim with
 * distance. Snap points keep it settling on a value.
 *
 * Mock only — scroll the wheel; the centred value is selected.
 */

const VALUES = Array.from({ length: 21 }, (_, i) => i * 25); // 0..500 g
const ITEM_H = 40;

export function WheelPickerDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(6); // 150 g

  // Centre the initial value once mounted.
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
      intent="Швидкий вибір порції/ваги прокруткою замість системного numpad. Крути колесо — центральне значення вибране."
    >
      <PhoneFrame>
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4">
          <p className="text-style-caption text-muted">Порція</p>
          <div className="relative h-[200px] w-40">
            {/* selection band */}
            <div
              className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 border-y border-accent/40 bg-accent/5"
              style={{ height: ITEM_H }}
            />
            {/* top/bottom fade */}
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
                      dist === 0 ? "text-text text-xl font-semibold" : "text-muted",
                    )}
                    style={{ height: ITEM_H, opacity: dist === 0 ? 1 : Math.max(0.25, 1 - dist * 0.28) }}
                  >
                    {v} г
                  </div>
                );
              })}
              <div style={{ height: 80 }} />
            </div>
          </div>
          <p className="text-2xs text-muted">Обрано: {VALUES[index]} г</p>
        </div>
      </PhoneFrame>
    </ProposalCard>
  );
}
