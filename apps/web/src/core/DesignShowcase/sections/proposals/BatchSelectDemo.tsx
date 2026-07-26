import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui";
import { ComparePair, MiniPhone } from "./_Compare";

/**
 * R2-UX-12 — Multi-select batch actions on lists.
 *
 * Before: each row is edited/deleted one at a time. After: long-press enters
 * a selection mode with checkboxes and a contextual action bar ("Видалити 3 ·
 * Перенести") so tidying many records is a single gesture. Distinct from the
 * existing batch *entry* proposal (keep-sheet-open) — this is batch *editing*
 * of existing records.
 *
 * Mock only — tap rows on the right to (de)select; watch the action bar.
 */

const ITEMS = [
  { id: 1, name: "Кава", amount: "₴ 65" },
  { id: 2, name: "Таксі", amount: "₴ 120" },
  { id: 3, name: "Обід", amount: "₴ 180" },
  { id: 4, name: "Кіно", amount: "₴ 200" },
];

export function BatchSelectDemo() {
  const [selected, setSelected] = useState<Set<number>>(new Set([1, 3]));

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <ComparePair
      before={
        <MiniPhone dim>
          <div className="flex-1 min-h-0 px-3 pt-2 space-y-1.5">
            <p className="text-style-caption text-muted mb-1">Витрати</p>
            {ITEMS.map((it) => (
              <div key={it.id} className="h-11 rounded-xl border border-line bg-panel flex items-center justify-between px-3">
                <span className="text-style-caption text-text">{it.name}</span>
                <span className="text-2xs tabular-nums text-muted">{it.amount}</span>
              </div>
            ))}
            <p className="text-2xs text-muted pt-1">Видалення — по одному запису.</p>
          </div>
        </MiniPhone>
      }
      after={
        <MiniPhone>
          <div className="flex-1 min-h-0 flex flex-col px-3 pt-2">
            <p className="text-style-caption text-muted mb-1">Витрати · вибір</p>
            <div className="space-y-1.5 flex-1">
              {ITEMS.map((it) => {
                const sel = selected.has(it.id);
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => toggle(it.id)}
                    className={cn(
                      "w-full h-11 rounded-xl border flex items-center gap-2 px-3 transition-colors",
                      sel ? "border-accent/50 bg-accent/10" : "border-line bg-panel",
                    )}
                  >
                    <span
                      className={cn(
                        "h-5 w-5 rounded-full border flex items-center justify-center shrink-0",
                        sel ? "bg-accent border-accent text-bg" : "border-line text-transparent",
                      )}
                    >
                      <Icon name="check-circle" size={14} />
                    </span>
                    <span className="text-style-caption text-text">{it.name}</span>
                    <span className="ml-auto text-2xs tabular-nums text-muted">{it.amount}</span>
                  </button>
                );
              })}
            </div>
            {/* contextual action bar */}
            <div
              className={cn(
                "mt-2 h-11 rounded-xl bg-accent text-bg flex items-center justify-between px-3 transition-opacity",
                selected.size ? "opacity-100" : "opacity-40",
              )}
            >
              <span className="text-style-caption font-medium">Обрано {selected.size}</span>
              <span className="flex items-center gap-3">
                <Icon name="arrow-up-right" size={16} />
                <Icon name="x-circle" size={16} />
              </span>
            </div>
          </div>
        </MiniPhone>
      }
    />
  );
}
