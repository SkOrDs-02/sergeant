import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Button, Icon } from "@shared/components/ui";
import { PhoneFrame, ProposalCard } from "./_PhoneFrame";

/**
 * UI-14 — Multi-select mode for lists.
 *
 * Tap «Вибрати» (in the real app: long-press a row) to enter selection mode;
 * rows gain checkboxes and a bulk-action bar slides up. Enables mass delete /
 * re-categorise of transactions without opening each one.
 */
const ROWS = [
  { id: "1", title: "Сільпо", cat: "Продукти", amount: "−420 ₴" },
  { id: "2", title: "Uklon", cat: "Транспорт", amount: "−180 ₴" },
  { id: "3", title: "Netflix", cat: "Підписки", amount: "−259 ₴" },
  { id: "4", title: "Кава", cat: "Кафе", amount: "−95 ₴" },
];

export function MultiSelectDemo() {
  const [mode, setMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function exit() {
    setMode(false);
    setPicked(new Set());
  }

  return (
    <ProposalCard
      id="UI-14"
      title="Режим множинного вибору"
      intent="Long-press → чекбокси → масові дії (видалити, змінити категорію). Тут вмикається кнопкою «Вибрати»."
    >
      <PhoneFrame>
        <div className="relative flex-1 min-h-0 flex flex-col">
          <div className="px-4 pb-2 flex items-center justify-between">
            <span className="text-style-label text-text">Витрати</span>
            <button
              type="button"
              onClick={() => (mode ? exit() : setMode(true))}
              className="text-style-caption text-accent"
            >
              {mode ? "Готово" : "Вибрати"}
            </button>
          </div>

          <div className="px-4 space-y-2">
            {ROWS.map((r) => {
              const on = picked.has(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => mode && toggle(r.id)}
                  className={cn(
                    "w-full flex items-center gap-3 h-16 px-3 rounded-2xl border text-left transition-colors",
                    on
                      ? "border-accent bg-accent/10"
                      : "border-line bg-panel",
                  )}
                >
                  {mode ? (
                    <span
                      className={cn(
                        "shrink-0 h-5 w-5 rounded-full border flex items-center justify-center",
                        on
                          ? "bg-accent border-accent text-bg"
                          : "border-divider-strong",
                      )}
                    >
                      {on ? <Icon name="check" size={12} /> : null}
                    </span>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-style-body text-text truncate">
                      {r.title}
                    </p>
                    <p className="text-2xs text-subtle">{r.cat}</p>
                  </div>
                  <span className="text-style-body text-text tabular-nums">
                    {r.amount}
                  </span>
                </button>
              );
            })}
          </div>

          {mode && picked.size > 0 ? (
            <div className="absolute inset-x-0 bottom-0 p-3 bg-panel border-t border-line flex items-center gap-2 animate-in slide-in-from-bottom">
              <span className="text-style-caption text-muted">
                Обрано {picked.size}
              </span>
              <div className="ml-auto flex gap-2">
                <Button variant="secondary" size="sm">
                  <Icon name="tag" size={14} />
                  Категорія
                </Button>
                <Button variant="destructive" size="sm">
                  <Icon name="trash" size={14} />
                  Видалити
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </PhoneFrame>
    </ProposalCard>
  );
}
