import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui";
import { ProposalCard } from "./_PhoneFrame";
import { ComparePair, MiniPhone } from "./_Compare";

/**
 * R2-UI-17 — Horizontal chips-filter row with fade edges.
 *
 * Зараз: filters hide behind a "Фільтри" button — every filter change is a
 * modal round-trip, and you can't see the active filter at a glance.
 * Може бути: a single scrollable row of toggle chips with gradient fade
 * masks on both edges (signalling "more off-screen"), so filters live one
 * tap away and the active one is always visible.
 *
 * Mock only — scroll the row and toggle chips on the right.
 */

const CHIPS = [
  "Усі",
  "Їжа",
  "Кава",
  "Транспорт",
  "Підписки",
  "Здоровʼя",
  "Розваги",
  "Дім",
  "Інше",
];

export function ChipsFilterRowDemo() {
  const [active, setActive] = useState<string>("Усі");

  return (
    <ProposalCard
      id="R2-UI-17"
      title="Стрічка чипсів-фільтрів із fade-краями"
      intent="Зараз фільтри сховані за кнопкою-модалкою; у пропозиції — горизонтальний скрол чипсів із градієнтними масками по краях. Скрол і тап праворуч."
    >
      <ComparePair
        before={
          <MiniPhone dim>
            <div className="flex-1 min-h-0 flex flex-col pt-2">
              <div className="px-4 flex items-center justify-between">
                <span className="text-style-label text-text">Транзакції</span>
                <span className="inline-flex items-center gap-1 h-9 px-3 rounded-full border border-line bg-panel text-muted">
                  <Icon name="filter" size={14} />
                  <span className="text-2xs">Фільтри</span>
                </span>
              </div>
              <div className="px-4 pt-4 space-y-2">
                <p className="text-2xs text-muted">
                  Активний фільтр невидимий — треба відкрити модалку.
                </p>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 rounded-2xl bg-panel border border-line"
                  />
                ))}
              </div>
            </div>
          </MiniPhone>
        }
        after={
          <MiniPhone>
            <div className="flex-1 min-h-0 flex flex-col pt-2">
              <div className="px-4 pb-2">
                <span className="text-style-label text-text">Транзакції</span>
              </div>
              <div className="relative">
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
                  Фільтр: <span className="text-text">{active}</span> ·{" "}
                  {active === "Усі" ? 24 : 6} записів
                </p>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 rounded-2xl bg-panel border border-line"
                  />
                ))}
              </div>
            </div>
          </MiniPhone>
        }
      />
    </ProposalCard>
  );
}
