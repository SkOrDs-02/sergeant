import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { PhoneFrame, ProposalCard } from "./_PhoneFrame";

/**
 * R2-UI-19 — DataTable → card-list on mobile (density switch).
 *
 * A dense multi-column table is unreadable on a 360px screen. The proposal
 * collapses each row into a card that promotes the primary columns (name,
 * amount) and demotes the rest to a secondary line — with a density toggle
 * for power users who still want the compact table.
 *
 * Mock only — toggle between "Таблиця" and "Картки".
 */

const ROWS = [
  { name: "АТБ", cat: "Їжа", date: "27 лип", amount: "₴ 340" },
  { name: "Uklon", cat: "Транспорт", date: "27 лип", amount: "₴ 120" },
  { name: "Netflix", cat: "Підписки", date: "26 лип", amount: "₴ 259" },
  { name: "Аптека", cat: "Здоровʼя", date: "25 лип", amount: "₴ 480" },
];

export function TableToCardDemo() {
  const [mode, setMode] = useState<"table" | "cards">("cards");

  return (
    <ProposalCard
      id="R2-UI-19"
      title="Таблиця → картки на мобільному"
      intent="Щільна багатоколонкова таблиця згортається в картки з пріоритетом ключових полів. Перемкни щільність."
    >
      <PhoneFrame>
        <div className="flex-1 min-h-0 flex flex-col pt-2">
          <div className="px-4 pb-3">
            <div className="inline-flex rounded-full border border-line bg-panel p-0.5">
              {(["cards", "table"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "px-3 h-8 rounded-full text-style-caption font-medium transition-colors",
                    mode === m ? "bg-accent text-bg" : "text-muted",
                  )}
                >
                  {m === "cards" ? "Картки" : "Таблиця"}
                </button>
              ))}
            </div>
          </div>

          {mode === "cards" ? (
            <div className="px-4 space-y-2">
              {ROWS.map((r) => (
                <div key={r.name} className="rounded-2xl bg-panel border border-line p-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-style-label text-text truncate">{r.name}</p>
                    <p className="text-2xs text-muted mt-0.5">{r.cat} · {r.date}</p>
                  </div>
                  <span className="text-style-label tabular-nums text-text shrink-0">{r.amount}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4">
              <div className="rounded-xl border border-line overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-2 py-1.5 bg-surface-muted text-2xs text-muted">
                  <span>Назва</span><span>Дата</span><span className="text-right">Сума</span>
                </div>
                {ROWS.map((r) => (
                  <div key={r.name} className="grid grid-cols-[1fr_auto_auto] gap-2 px-2 py-2 border-t border-line text-2xs">
                    <span className="text-text truncate">{r.name}</span>
                    <span className="text-muted whitespace-nowrap">{r.date}</span>
                    <span className="text-text tabular-nums text-right whitespace-nowrap">{r.amount}</span>
                  </div>
                ))}
              </div>
              <p className="text-2xs text-muted mt-2">Компактно, але вимагає горизонтального читання.</p>
            </div>
          )}
        </div>
      </PhoneFrame>
    </ProposalCard>
  );
}
