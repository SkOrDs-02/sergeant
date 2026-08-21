import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui";
import { ProposalCard } from "./_PhoneFrame";
import { ComparePair, MiniPhone } from "./_Compare";

/**
 * R2-UI-17 — Horizontal chips-filter row with fade edges. **Відхилено.**
 *
 * AI-CONTEXT: цю пропозицію активно рекламувала рівно ту схему, яку
 * анти-слоп-стратегія (`docs/05-design/design/anti-slop-strategy.md`,
 * атрактор №7 §3.2) називає провальним патерном — горизонтальний
 * chip-scroller-фільтр без стелі, замаскований градієнтними fade-краями.
 * Головного носія цього атрактора закрито 2026-08-06: у `TransactionFilters`
 * (Фінік) чипи категорій прибрані, бо ту саму роботу вже краще робить
 * клікабельне кільце категорій на Аналітиці — носія закрито НЕ
 * перемальовуванням, а тим, що роботу вже робила краща поверхня.
 *
 * Fade-краї лікують СИМПТОМ («не видно, що є ще поза екраном»), а не
 * ПРИЧИНУ (список фільтрів росте без верхньої межі — саме атрактор №7).
 * Мокап лишається нижче лише як історичний референс review-хвилі 2026-07 —
 * не бери його як зразок для нового UI.
 *
 * Було: filters hide behind a "Фільтри" button — every filter change is a
 * modal round-trip, and you can't see the active filter at a glance.
 * Пропонувалось: a single scrollable row of toggle chips with gradient fade
 * masks on both edges. Mock only — scroll the row and toggle chips on the
 * right.
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
      status="rejected"
      title="Стрічка чипсів-фільтрів із fade-краями (відхилено)"
      intent="Горизонтальний chip-scroller із градієнтними масками по краях, рекламував саме атрактор №7 анти-слоп-стратегії. Мокап нижче лишається лише як історичний референс."
    >
      <div
        role="note"
        className="mb-4 rounded-xl border border-danger/30 bg-danger/8 px-4 py-3 text-style-caption text-text"
      >
        <p className="font-medium text-danger-strong">
          Відхилено: chip-scroller-фільтр без верхньої межі це атрактор №7
        </p>
        <p className="mt-1 text-muted">
          Патерн суперечить анти-слоп атрактору №7 (chip-scroller-и як дефолтний
          фільтр). Носія в Фініку закрито 2026-08-06, не перемальовуванням, а
          тим, що ту саму роботу вже краще робила інша поверхня (клікабельне
          кільце категорій на Аналітиці). Fade-краї тут лікують симптом («не
          видно, що є ще поза екраном»), а не причину (список фільтрів без
          стелі).
        </p>
      </div>
      <ComparePair
        before={
          <MiniPhone dim>
            <div className="flex-1 min-h-0 flex flex-col pt-2">
              <div className="px-4 flex items-center justify-between">
                <span className="text-style-label text-text">Транзакції</span>
                <span className="inline-flex items-center gap-1 h-9 px-3 rounded-full border border-line bg-panel text-muted">
                  <Icon name="filter" size={14} />
                  <span className="text-style-caption">Фільтри</span>
                </span>
              </div>
              <div className="px-4 pt-4 space-y-2">
                <p className="text-style-caption text-muted">
                  Активний фільтр невидимий, треба відкрити модалку.
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
                <p className="text-style-caption text-muted">
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
