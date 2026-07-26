import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { PhoneFrame, ProposalCard } from "./_PhoneFrame";

/**
 * R2-UI-17 — Horizontal chips-filter row with fade edges.
 *
 * A single scrollable row of filter chips (tags / categories) with gradient
 * fade masks on both edges to signal "more off-screen". Chips are toggle
 * filters; the active set drives the mock count below. Keeps filters one tap
 * away without a modal, and reads as scrollable thanks to the edge fades.
 *
 * Mock only — scroll the row and toggle chips.
 */

const CHIPS = ["Усі", "Їжа", "Кава", "Транспорт", "Підписки", "Здоровʼя", "Розваги", "Дім", "Інше"];

export function ChipsFilterRowDemo() {
  const [active, setActive] = useState<string>("Усі");

  return (
    <ProposalCard
      id="R2-UI-17"
      title="Стрічка чипсів-фільтрів із fade-краями"
      intent="Горизонтальний скрол фільтрів з градієнтними масками по краях (натяк «є ще»). Скрол і тап."
    >
      <PhoneFrame>
        <div className="flex-1 min-h-0 flex flex-col pt-2">
          <div className="relative">
            {/* edge fades */}
            <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 z-10 bg-gradient-to-r from-bg to-transparent" />
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 z-10 bg-gradient-to-l from-bg to-transparent" />
            <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-1">
              {CHIPS.map((c) => {
                const sel = c === active;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setActive(c)}
                    aria-pressed={sel}
                    className={cn(
                      "shrink-0 h-9 px-4 rounded-full border text-style-caption font-medium transition-colors",
                      sel
                        ? "bg-accent border-accent text-bg"
                        : "bg-panel border-line text-muted",
                    )}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-4 pt-4 space-y-2">
            <p className="text-2xs text-muted">
              Фільтр: <span className="text-text">{active}</span> · {active === "Усі" ? 24 : 6} записів
            </p>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded-2xl bg-panel border border-line" />
            ))}
          </div>
        </div>
      </PhoneFrame>
    </ProposalCard>
  );
}
