import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui";
import { PhoneFrame, ProposalCard } from "./_PhoneFrame";

/**
 * UI-12 — Persistent horizontal date scrubber.
 *
 * Replaces the date-picker modal with an always-visible day strip that has
 * large (44px) touch targets. Today is marked; the selected day drives the
 * mock content below. Tapping a day is instant — no dialog round-trip.
 */
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
// Mock a 14-day window ending "today" (index 9 = today).
const DAYS = Array.from({ length: 14 }, (_, i) => ({
  index: i,
  weekday: WEEKDAYS[i % 7],
  day: 8 + i,
  today: i === 9,
}));

export function DateScrubberDemo() {
  const [selected, setSelected] = useState(9);

  return (
    <ProposalCard
      id="UI-12"
      title="Стрічка вибору дня (date scrubber)"
      intent="Горизонтальний вибір дати з великими touch-цілями замість модалки. Тапни день."
    >
      <PhoneFrame>
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-4 pb-1 flex items-center gap-2">
            <Icon name="calendar" size={16} className="text-muted" />
            <span className="text-style-label text-text">Серпень</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto px-4 py-2 no-scrollbar">
            {DAYS.map((d) => {
              const isSel = d.index === selected;
              return (
                <button
                  key={d.index}
                  type="button"
                  onClick={() => setSelected(d.index)}
                  className={cn(
                    "shrink-0 w-11 h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 border transition-colors",
                    isSel
                      ? "bg-accent border-accent text-bg"
                      : "bg-panel border-line text-muted",
                  )}
                  aria-pressed={isSel}
                >
                  <span className="text-2xs uppercase tracking-wide">
                    {d.weekday}
                  </span>
                  <span className="text-style-body tabular-nums font-semibold">
                    {d.day}
                  </span>
                  {d.today ? (
                    <span
                      className={cn(
                        "h-1 w-1 rounded-full",
                        isSel ? "bg-bg" : "bg-accent",
                      )}
                    />
                  ) : (
                    <span className="h-1 w-1" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="px-4 pt-3 space-y-2">
            <p className="text-style-caption text-subtle">
              {selected === 9 ? "Сьогодні" : `День ${DAYS[selected]?.day}`} · 3
              записи
            </p>
            <div className="h-14 rounded-2xl bg-panel border border-line" />
            <div className="h-14 rounded-2xl bg-panel border border-line" />
          </div>
        </div>
      </PhoneFrame>
    </ProposalCard>
  );
}
