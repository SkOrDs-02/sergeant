import { useState } from "react";
import { Icon } from "@shared/components/ui";
import { DateScrubber } from "@shared/components/ui/DateScrubber";
import { formatKyivLongDate, getKyivDayKey } from "@shared/lib/time/kyivTime";
import { PhoneFrame, ProposalCard } from "./_PhoneFrame";

/**
 * UI-12 — Persistent horizontal date scrubber.
 *
 * Replaces the date-picker modal with an always-visible day strip that has
 * large (44px) touch targets. Today is marked; the selected day drives the
 * mock content below. Tapping a day is instant — no dialog round-trip.
 *
 * SHIPPED: `DateScrubber` (@shared/components/ui/DateScrubber) — this demo
 * renders the real component (Kyiv day-key value/onChange), not a mock day
 * strip.
 */

const TODAY_KEY = getKyivDayKey();

export function DateScrubberDemo() {
  const [selected, setSelected] = useState(TODAY_KEY);

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
            <span className="text-style-label text-text">
              {formatKyivLongDate(new Date().toISOString())}
            </span>
          </div>
          <div className="px-4 py-2">
            <DateScrubber
              value={selected}
              onChange={setSelected}
              aria-label="Вибір дня"
            />
          </div>

          <div className="px-4 pt-3 space-y-2">
            <p className="text-style-caption text-subtle">
              {selected === TODAY_KEY ? "Сьогодні" : selected} · 3 записи
            </p>
            <div className="h-14 rounded-2xl bg-panel border border-line" />
            <div className="h-14 rounded-2xl bg-panel border border-line" />
          </div>
        </div>
      </PhoneFrame>
    </ProposalCard>
  );
}
