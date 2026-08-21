import { ProposalCard } from "./_PhoneFrame";
import { ComparePair, MiniPhone } from "./_Compare";

/**
 * R2-UI-19 — DataTable → card-list on mobile.
 *
 * Зараз: a dense multi-column table forces horizontal reading and truncation
 * on a 360px screen — the amount column is the whole point yet the hardest to
 * scan.
 * Може бути: each row collapses into a card that promotes the primary columns
 * (name, amount) and demotes the rest to a secondary line.
 */

const ROWS = [
  { name: "АТБ", cat: "Їжа", date: "27 лип", amount: "₴ 340" },
  { name: "Uklon", cat: "Транспорт", date: "27 лип", amount: "₴ 120" },
  { name: "Netflix", cat: "Підписки", date: "26 лип", amount: "₴ 259" },
  { name: "Аптека", cat: "Здоровʼя", date: "25 лип", amount: "₴ 480" },
];

export function TableToCardDemo() {
  return (
    <ProposalCard
      id="R2-UI-19"
      title="Таблиця → картки на мобільному"
      intent="Зараз щільна багатоколонкова таблиця тисне текст на вузькому екрані; у пропозиції кожен рядок це картка з пріоритетом ключових полів."
    >
      <ComparePair
        before={
          <MiniPhone dim>
            <div className="flex-1 min-h-0 flex flex-col pt-3 px-3">
              <span className="text-style-label text-text mb-2">
                Транзакції
              </span>
              <div className="rounded-xl border border-line overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto] gap-1.5 px-2 py-1.5 bg-surface-muted text-style-caption text-muted">
                  <span>Назва</span>
                  <span>Дата</span>
                  <span className="text-right">Сума</span>
                </div>
                {ROWS.map((r) => (
                  <div
                    key={r.name}
                    className="grid grid-cols-[1fr_auto_auto] gap-1.5 px-2 py-2 border-t border-line text-style-caption"
                  >
                    <span className="text-text truncate">{r.name}</span>
                    <span className="text-muted whitespace-nowrap">
                      {r.date}
                    </span>
                    <span className="text-text tabular-nums text-right whitespace-nowrap">
                      {r.amount}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-style-caption text-muted mt-3">
                Дрібно, обрізано, читати по горизонталі.
              </p>
            </div>
          </MiniPhone>
        }
        after={
          <MiniPhone>
            <div className="flex-1 min-h-0 flex flex-col pt-3 px-3">
              <span className="text-style-label text-text mb-2">
                Транзакції
              </span>
              <div className="space-y-2">
                {ROWS.map((r) => (
                  <div
                    key={r.name}
                    className="rounded-2xl bg-panel border border-line p-3 flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-style-label text-text truncate">
                        {r.name}
                      </p>
                      <p className="text-style-caption text-muted mt-0.5">
                        {r.cat} · {r.date}
                      </p>
                    </div>
                    <span className="text-style-label tabular-nums text-text shrink-0">
                      {r.amount}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-style-caption text-muted mt-3">
                Сума помітна, все читається згори вниз.
              </p>
            </div>
          </MiniPhone>
        }
      />
    </ProposalCard>
  );
}
